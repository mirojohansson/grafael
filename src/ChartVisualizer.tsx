import React, { Component, useMemo, useState } from 'react';
import {
  BRAND_SCALES,
  BRAND_SWATCHES,
  cleanFloat,
  computeYScale,
  formatDatapointDate,
  formatValue,
  FULL_MONTH_NAMES,
  getContrastColor,
  getItemColor,
  isEmptyValue,
  isPureNumericString,
  MONTH_NAMES,
  parseVal,
  tryParseDate
} from './chartUtils';

export class ErrorBoundary extends Component<any, any> {
      constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
      }
      componentDidCatch(error: any, errorInfo: any) {
        console.error("ErrorBoundary caught:", error, errorInfo);
      }
      render() {
        if (this.state.hasError) {
          return (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-red-50 text-red-800 border border-red-200">
              <span className="font-bold text-sm mb-1">Ett visningsfel uppstod</span>
              <span className="text-xs text-red-600 mb-3 max-w-md font-mono">{this.state.error?.message || String(this.state.error)}</span>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-3 py-1 bg-red-700 text-white text-xs font-semibold rounded hover:bg-red-800"
              >
                Återställ vy
              </button>
            </div>
          );
        }
        return this.props.children;
      }
    }

    // Precise reference line label renderer handling all combinations of orientation and positions
    function renderRefLineLabel(isLineHorizontal, lineCoord, refItem, padLeft, padTop, plotW, plotH, labelColor, refFontSize) {
      const pos = refItem.textPosition || "right";
      if (isLineHorizontal) {
        const ry = lineCoord;
        let x = padLeft + plotW - 4;
        let y = ry - 5;
        let anchor = "end";

        if (pos === "left") {
          x = padLeft + 6;
          anchor = "start";
        } else if (pos === "center" || pos === "along") {
          x = padLeft + plotW / 2;
          anchor = "middle";
        } else if (pos === "below_left") {
          x = padLeft + 6;
          y = ry + 13;
          anchor = "start";
        } else if (pos === "below_right" || pos === "bottom") {
          x = padLeft + plotW - 4;
          y = ry + 13;
          anchor = "end";
        }
        return (
          <text x={x} y={y} textAnchor={anchor as any} fontSize={refFontSize} fill={labelColor} fontWeight="700">
            {refItem.label}
          </text>
        );
      } else {
        const rx = lineCoord;
        if (pos === "along") {
          const cy = padTop + plotH / 2;
          return (
            <text
              x={rx - 6}
              y={cy}
              textAnchor="middle"
              transform={`rotate(-90, ${rx - 6}, ${cy})`}
              fontSize={refFontSize}
              fill={labelColor}
              fontWeight="700"
            >
              {refItem.label}
            </text>
          );
        }

        let x = rx + 6;
        let y = padTop + 14;
        let anchor = "start";

        if (pos === "left") {
          x = rx - 6;
          anchor = "end";
        } else if (pos === "bottom" || pos === "below_right" || pos === "bottom_right") {
          x = rx + 6;
          y = padTop + plotH - 6;
          anchor = "start";
        } else if (pos === "below_left" || pos === "bottom_left") {
          x = rx - 6;
          y = padTop + plotH - 6;
          anchor = "end";
        }
        return (
          <text x={x} y={y} textAnchor={anchor as any} fontSize={refFontSize} fill={labelColor} fontWeight="700">
            {refItem.label}
          </text>
        );
      }
    }

    // Category / Time reference line precise coordinate calculator
    function computeXRefPosition(refItem, displayRows, catColIdx, plotW, plotH, padLeft, padTop, isHorizontal, chartType, parsedDates, datePart1, datePart2, datePart3, dataDecSep = "auto", dataThousandSep = "auto") {
      const refVal = String(refItem.val || "").trim();
      if (!refVal && refVal !== "0") return null;

      const N_rows = displayRows.length;
      if (N_rows === 0) return null;

      let fracIdx = null;

      const exactCatIdx = displayRows.findIndex(r => Array.isArray(r) && String(r[catColIdx] || "").trim() === refVal);
      if (exactCatIdx !== -1) {
        fracIdx = exactCatIdx;
      }

      if (fracIdx === null && isPureNumericString(refVal, dataDecSep, dataThousandSep)) {
        const targetNum = parseVal(refVal, dataDecSep, dataThousandSep);
        const rowNums = displayRows.map(r => {
          const s = String(r[catColIdx] || "").trim();
          return isPureNumericString(s, dataDecSep, dataThousandSep) ? parseVal(s, dataDecSep, dataThousandSep) : NaN;
        });

        const allNumeric = rowNums.every(n => !isNaN(n));
        if (allNumeric && N_rows > 1) {
          if (targetNum <= rowNums[0]) {
            fracIdx = (targetNum - rowNums[0]) / Math.max(1, rowNums[1] - rowNums[0]);
          } else if (targetNum >= rowNums[N_rows - 1]) {
            fracIdx = (N_rows - 1) + (targetNum - rowNums[N_rows - 1]) / Math.max(1, rowNums[N_rows - 1] - rowNums[N_rows - 2]);
          } else {
            for (let i = 0; i < N_rows - 1; i++) {
              const a = rowNums[i], b = rowNums[i + 1];
              if ((targetNum >= a && targetNum <= b) || (targetNum <= a && targetNum >= b)) {
                const span = b - a;
                fracIdx = span !== 0 ? i + (targetNum - a) / span : i;
                break;
              }
            }
          }
        }
      }

      if (fracIdx === null) {
        const targetDate = tryParseDate(refVal, datePart1, datePart2, datePart3);
        if (targetDate && parsedDates && parsedDates.length === N_rows) {
          const validDates = parsedDates.filter(Boolean);
          if (validDates.length >= N_rows * 0.7 && N_rows > 1) {
            const targetTime = targetDate.date.getTime();
            const rowTimes = parsedDates.map(p => p ? p.date.getTime() : NaN);
            if (targetTime <= rowTimes[0]) {
              fracIdx = (targetTime - rowTimes[0]) / Math.max(1, rowTimes[1] - rowTimes[0]);
            } else if (targetTime >= rowTimes[N_rows - 1]) {
              fracIdx = (N_rows - 1) + (targetTime - rowTimes[N_rows - 1]) / Math.max(1, rowTimes[N_rows - 1] - rowTimes[N_rows - 2]);
            } else {
              for (let i = 0; i < N_rows - 1; i++) {
                const t0 = rowTimes[i], t1 = rowTimes[i + 1];
                if (!isNaN(t0) && !isNaN(t1)) {
                  if ((targetTime >= t0 && targetTime <= t1) || (targetTime <= t0 && targetTime >= t1)) {
                    const span = t1 - t0;
                    fracIdx = span !== 0 ? i + (targetTime - t0) / span : i;
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (fracIdx === null) {
        const lower = refVal.toLowerCase();
        const idx = displayRows.findIndex(r => String(r[catColIdx] || "").toLowerCase().includes(lower));
        if (idx !== -1) fracIdx = idx;
        else return null;
      }

      const offset = (refItem.catOffset === "after") ? 0.5 : (refItem.catOffset === "before" ? -0.5 : 0);
      const finalFrac = fracIdx + offset;

      if (isHorizontal) {
        const catSlotH = plotH / (N_rows || 1);
        const ry = padTop + (finalFrac + 0.5) * catSlotH;
        return { posCoord: ry };
      } else if (chartType === "Line") {
        const N = Math.max(N_rows - 1, 1);
        const rx = padLeft + (finalFrac / N) * plotW;
        return { posCoord: rx };
      } else {
        const catSlotW = plotW / (N_rows || 1);
        const rx = padLeft + (finalFrac + 0.5) * catSlotW;
        return { posCoord: rx };
      }
    }

    // Chart Visualizer with exact right-aligned labels on flush-left baseline
    export function ChartVisualizer(props: any) {
      const { headers, rows, seriesList, pieCategories, seriesColors, config, isDark = false, isViewerMode = false, onElementClick, customWidth, isPrint = false, containerWidth, containerHeight } = props;
      const [hoveredData, setHoveredData] = useState<any>(null);

      const pxPerPt = (25.4 / 72) / (99.2 / 800);
      const catFontSize = isPrint ? cleanFloat(8 * pxPerPt) : 14;
      const valFontSize = isPrint ? cleanFloat(8 * pxPerPt) : 14;
      const totalFontSize = isPrint ? cleanFloat(8.5 * pxPerPt) : 14;
      const segFontSize = isPrint ? cleanFloat(7 * pxPerPt) : 12;
      const axisFontSize = catFontSize;
      const refFontSize = isPrint ? cleanFloat(7.5 * pxPerPt) : 13;
      const pieSliceFontSize = isPrint ? cleanFloat(7.5 * pxPerPt) : 13;
      const pieHeaderFontSize = isPrint ? cleanFloat(9 * pxPerPt) : 15;

      const cleanRows = useMemo(() => {
        if (!rows || !rows.length) return [];
        return rows.filter(r => Array.isArray(r) && r.some(c => c !== undefined && c !== null && String(c).trim() !== ""));
      }, [rows]);

      const hasValidData = useMemo(() => Boolean(headers && headers.length && cleanRows && cleanRows.length), [headers, cleanRows]);
      const isHorizontal = config.chartType === "Bar" && config.barOrientation === "Horizontal";
      const catColIdx = config.categoryColIndex ?? 0;

      const divisor = (config.valueDivisor === "custom" 
        ? (parseFloat(config.customDivisorVal) || 1) 
        : (parseFloat(config.valueDivisor) || 1));

      const isRowSeries = useMemo(() => {
        if (!rows || rows.length < 2 || !headers || headers.length < 3) return false;
        let pRowIdx = config.hierarchyParentRow === "header" ? -1 : (typeof config.hierarchyParentRow === "number" ? config.hierarchyParentRow : -1);
        let sRowIdx = config.hierarchySubRow === "header" ? -1 : (typeof config.hierarchySubRow === "number" ? config.hierarchySubRow : 0);
        if (pRowIdx === sRowIdx) {
          if (pRowIdx === -1) sRowIdx = 0;
          else sRowIdx = pRowIdx === 0 ? 1 : 0;
        }
        const checkIdx = sRowIdx >= 0 ? sRowIdx : (pRowIdx >= 0 ? pRowIdx : 0);
        const subRow = rows[checkIdx];
        if (!subRow) return false;
        const r0Cells = subRow.slice(1).filter(c => c !== undefined && c !== null && String(c).trim() !== "");
        if (r0Cells.length === 0) return false;
        const r0TextCount = r0Cells.filter(c => !isPureNumericString(c, config.dataDecSep, config.dataThousandSep)).length;
        const r0IsMostlyText = (r0TextCount / r0Cells.length) >= 0.5;
        
        const subsequentRows = rows.filter((r, idx) => idx !== pRowIdx && idx !== sRowIdx && Array.isArray(r) && r.slice(1).some(c => c && String(c).trim() !== ""));
        if (subsequentRows.length === 0) return false;
        const numSubsequent = subsequentRows.filter(r => {
          const cells = r.slice(1).filter(c => c && String(c).trim() !== "");
          const numCells = cells.filter(c => isPureNumericString(c, config.dataDecSep, config.dataThousandSep));
          return cells.length > 0 && (numCells.length / cells.length >= 0.5);
        }).length;
        return r0IsMostlyText && (numSubsequent / subsequentRows.length >= 0.5);
      }, [headers, rows, config.dataDecSep, config.dataThousandSep, config.hierarchyParentRow, config.hierarchySubRow]);

      // Chronological & Date sorting
      const displayRows = useMemo(() => {
        if (!cleanRows || cleanRows.length <= 1 || config.dataSortOrder === "original" || config.useHierarchy || isRowSeries) {
          return cleanRows;
        }
        const indexed = cleanRows.map((r, i) => ({ row: r, origIdx: i }));
        indexed.sort((a, b) => {
          const rawA = a.row[catColIdx];
          const rawB = b.row[catColIdx];
          const dateA = tryParseDate(rawA, config.datePart1, config.datePart2, config.datePart3);
          const dateB = tryParseDate(rawB, config.datePart1, config.datePart2, config.datePart3);

          let cmp = 0;
          if (dateA && dateB) {
            cmp = dateA.date.getTime() - dateB.date.getTime();
          } else {
            const numA = parseVal(rawA, config.dataDecSep, config.dataThousandSep);
            const numB = parseVal(rawB, config.dataDecSep, config.dataThousandSep);
            if (!isNaN(numA) && !isNaN(numB) && isPureNumericString(rawA, config.dataDecSep, config.dataThousandSep) && isPureNumericString(rawB, config.dataDecSep, config.dataThousandSep)) {
              cmp = numA - numB;
            } else {
              cmp = String(rawA || "").localeCompare(String(rawB || ""));
            }
          }
          return config.dataSortOrder === "reverse_chronological" ? -cmp : cmp;
        });
        return indexed.map(item => item.row);
      }, [cleanRows, config.dataSortOrder, catColIdx, config.dataDecSep, config.dataThousandSep, config.datePart1, config.datePart2, config.datePart3]);

      const parsedDates = useMemo(() => {
        if (!displayRows || !displayRows.length) return [];
        return displayRows.map(r => Array.isArray(r) ? tryParseDate(r[catColIdx], config.datePart1, config.datePart2, config.datePart3) : null);
      }, [displayRows, catColIdx, config.datePart1, config.datePart2, config.datePart3]);

      const width = isPrint ? (customWidth || 800) : (containerWidth || customWidth || 800);
      const height = isPrint ? (containerHeight || 520) : (containerHeight || config.chartHeight || 480);
      const safeSeriesCount = Math.max(seriesList.length, 1);
      const seriesCols = headers.map((_, i) => i).filter(i => i !== catColIdx);

      // Value extremes for selective value labeling
      const seriesExtremes = useMemo(() => {
        const map = {};
        seriesCols.forEach(colIdx => {
          let sMin = Infinity, sMax = -Infinity;
          displayRows.forEach(r => {
            const v = parseVal(r[colIdx], config.dataDecSep, config.dataThousandSep) / divisor;
            if (v > 0) {
              if (v < sMin) sMin = v;
              if (v > sMax) sMax = v;
            }
          });
          map[colIdx] = { min: sMin, max: sMax };
        });
        return map;
      }, [displayRows, seriesCols, config.dataDecSep, config.dataThousandSep, divisor]);

      const shouldShowVal = (rIdx, colIdx, val, catStr) => {
        if (config.showValueLabels === false) return false;
        if (config.chartType === "Line" && config.drawLineValues === false) return false;
        const mode = config.valueLabelMode || "all";
        if (mode === "last") return rIdx === displayRows.length - 1;
        if (mode === "first_last") return rIdx === 0 || rIdx === displayRows.length - 1;
        if (mode === "min_max") {
          const ext = seriesExtremes[colIdx];
          return ext && (val === ext.min || val === ext.max);
        }
        if (mode === "custom") {
          return (config.customValueLabels || []).includes(String(catStr).trim());
        }
        return true;
      };

      const getFormattedXLabel = (rawVal, idx) => {
        if (rawVal === undefined || rawVal === null) return "";
        const strVal = String(rawVal).trim();
        const pDate = (parsedDates && parsedDates[idx]) ? parsedDates[idx] : tryParseDate(strVal, config.datePart1, config.datePart2, config.datePart3);

        if (!pDate || config.dateFormatMode === "Original") {
          return formatValue(strVal, headers[catColIdx], config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep);
        }

        const lang = config.dateMonthLang || "sv";
        const mList = MONTH_NAMES[lang] || MONTH_NAMES.sv;
        const mName = pDate.month ? mList[pDate.month - 1] : "";
        const yrStr = pDate.year ? String(pDate.year) : "";
        const shortYr = yrStr.length >= 4 ? yrStr.slice(2) : yrStr;
        const dStr = pDate.day ? String(pDate.day) : "";

        switch (config.dateFormatMode) {
          case "MonthOnly": return mName || yrStr;
          case "MonthYear": return (mName && yrStr) ? `${mName} ${yrStr}` : (mName || yrStr);
          case "ShortMonthYear": return pDate.month && shortYr ? `${MONTH_NAMES.num[pDate.month - 1]}/${shortYr}` : (mName || yrStr);
          case "YearOnly": return yrStr || mName;
          case "DayMonth": return dStr && mName ? `${dStr} ${mName}` : (mName ? (yrStr ? `${mName} ${yrStr}` : mName) : yrStr);
          case "DayMonthYear": return (dStr && mName && yrStr) ? `${dStr} ${mName} ${yrStr}` : ((dStr && mName) ? `${dStr} ${mName}` : (yrStr || mName));
          case "Auto":
          default:
            if (pDate.isYearOnly) return yrStr;
            if (pDate.isYearMonth) return (mName && yrStr) ? `${mName} ${yrStr}` : (mName || yrStr);
            if (pDate.isMonthDay) return dStr && mName ? `${dStr} ${mName}` : (dStr || mName);
            if (pDate.day && pDate.month) return `${dStr} ${mName}`;
            if (pDate.month && yrStr) return `${mName} ${yrStr}`;
            return yrStr || mName || strVal;
        }
      };

      const getCategoryPopupDisplay = (row) => {
        if (!row) return "";
        const rawCat = row[catColIdx];
        const rIdx = displayRows.indexOf(row);
        const pDate = (parsedDates && parsedDates[rIdx]) ? parsedDates[rIdx] : tryParseDate(rawCat, config.datePart1, config.datePart2, config.datePart3);

        const popupMode = config.popupDateFormat || "full_readable";
        if (popupMode === "inherit_x") {
          const formatted = getFormattedXLabel(rawCat, rIdx >= 0 ? rIdx : 0);
          return formatted || formatValue(rawCat, headers[catColIdx], config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep);
        }

        if (popupMode === "original") {
          return String(rawCat ?? "").trim();
        }

        if (pDate) {
          const lang = config.dateMonthLang || "sv";
          return formatDatapointDate(pDate, lang, popupMode, String(rawCat ?? "").trim());
        }

        return formatValue(rawCat, headers[catColIdx], config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep);
      };

      // Hierarchical clustering data memo
      const hierarchicalData = useMemo(() => {
        if (config.chartType !== "Bar") return null;
        
        const useRowMode = config.useHierarchy 
          ? config.hierarchySource === "rows" 
          : (isRowSeries || config.hierarchySource === "rows");
        
        if (!config.useHierarchy && !useRowMode) return null;

        if (useRowMode) {
          let pRowSetting = config.hierarchyParentRow ?? "header";
          let sRowSetting = config.hierarchySubRow ?? 0;
          if (pRowSetting === sRowSetting) {
            if (pRowSetting === "header") sRowSetting = 0;
            else sRowSetting = "header";
          }
          const parentVals = (pRowSetting === "header")
            ? headers
            : (rows[pRowSetting] || headers);
          const subVals = (sRowSetting === "header")
            ? headers
            : (typeof sRowSetting === "number" ? (rows[sRowSetting] || headers) : (rows[0] || headers));

          if (!subVals || !parentVals || !parentVals.length) return null;

          const sColIdx = typeof config.hierarchySeriesCol === "number" ? config.hierarchySeriesCol : 0;
          const parentRowIdx = pRowSetting === "header" ? -1 : (typeof pRowSetting === "number" ? pRowSetting : -1);
          const subRowIdx = sRowSetting === "header" ? -1 : (typeof sRowSetting === "number" ? sRowSetting : 0);

          // Series rows: rows excluding parent row, sub row, and totals
          const seriesRows = [];
          for (let r = 0; r < rows.length; r++) {
            if (r === parentRowIdx || r === subRowIdx) continue;
            const row = rows[r];
            if (Array.isArray(row)) {
              const sName = String(row[sColIdx] || "").trim();
              if (sName && !/^yhteens[aä]/i.test(sName) && !/^totalt?$/i.test(sName) && !/^sum(ma)?$/i.test(sName)) {
                seriesRows.push({ sName, row });
              }
            }
          }

          const numCols = Math.min(parentVals.length, subVals.length);
          const bars = [];
          let lastParent = "";

          for (let c = 1; c < numCols; c++) {
            let pVal = String(parentVals[c] || "").trim();
            if (!pVal && lastParent) pVal = lastParent;
            if (pVal) lastParent = pVal;
            const subVal = String(subVals[c] || "").trim();

            const seriesValues = [];
            let totalVal = 0;
            seriesRows.forEach(({ sName, row }, sIdx) => {
              const rawCell = row[c];
              const val = parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor;
              const defaultColor = seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length];
              const color = getItemColor(subVal || pVal, sName, defaultColor, config.categoryColorOverrides);              
              const validNum = isNaN(val) ? 0 : val;
              seriesValues.push({ sName, val: validNum, color });
              if (validNum > 0) totalVal += validNum;
            });

            bars.push({
              barIndex: c - 1,
              colIndex: c,
              parentLabel: pVal || `Grupp ${c}`,
              subLabel: subVal || `Stapel ${c}`,
              seriesValues,
              totalVal
            });
          }

          if (!bars.length) return null;

          const groups = [];
          bars.forEach(bar => {
            let grp = groups.find(g => g.parentLabel === bar.parentLabel);
            if (!grp) {
              grp = { parentLabel: bar.parentLabel, bars: [] };
              groups.push(grp);
            }
            grp.bars.push(bar);
          });

          return { groups, bars, isRowBased: true };
        } else {
          // Column-based hierarchy: Col 0 = Parent, Col 1 = Subcategory, Cols 2..N = Series
          const pColIdx = config.hierarchyParentCol ?? 0;
          let sColIdx = config.hierarchySubCol ?? 1;
          if (pColIdx === sColIdx) {
            sColIdx = pColIdx === 0 ? 1 : 0;
          }
          const sCols = headers.map((_, i) => i).filter(i => i !== pColIdx && i !== sColIdx);

          if (!sCols.length) return null;

          const bars = [];
          let lastParent = "";

          displayRows.forEach((row, rIdx) => {
            if (!Array.isArray(row)) return;
            const hasAnyNumber = sCols.some(cIdx => isPureNumericString(row[cIdx], config.dataDecSep, config.dataThousandSep));
            if (!hasAnyNumber) return;

            let pVal = String(row[pColIdx] || "").trim();
            if (!pVal && lastParent) pVal = lastParent;
            if (pVal) lastParent = pVal;
            const subVal = String(row[sColIdx] || "").trim();

            const seriesValues = [];
            let totalVal = 0;
            sCols.forEach((cIdx, sIdx) => {
              const sName = headers[cIdx];
              const rawCell = row[cIdx];
              const val = parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor;
              const defaultColor = seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length];
              const color = getItemColor(subVal || pVal, sName, defaultColor, config.categoryColorOverrides);
              const validNum = isNaN(val) ? 0 : val;
              seriesValues.push({ sName, val: validNum, color });
              if (validNum > 0) totalVal += validNum;
            });

            bars.push({
              barIndex: bars.length,
              rowIndex: rIdx,
              parentLabel: pVal || `Grupp ${bars.length + 1}`,
              subLabel: subVal || `Stapel ${bars.length + 1}`,
              seriesValues,
              totalVal,
              rowRef: row
            });
          });

          if (!bars.length) return null;

          const groups = [];
          bars.forEach(bar => {
            let grp = groups.find(g => g.parentLabel === bar.parentLabel);
            if (!grp) {
              grp = { parentLabel: bar.parentLabel, bars: [] };
              groups.push(grp);
            }
            grp.bars.push(bar);
          });

          return { groups, bars, isRowBased: false };
        }
      }, [config.useHierarchy, config.chartType, config.hierarchySource, config.hierarchyParentRow, config.hierarchySubRow, config.hierarchySeriesCol, config.hierarchyParentCol, config.hierarchySubCol, headers, rows, displayRows, seriesColors, config.dataDecSep, config.dataThousandSep, divisor, isRowSeries, config.categoryColorOverrides]);

      let dataMin = 0, dataMax = 0;
      const isStacked100 = config.chartType === "Bar" && config.isStacked && config.isStacked100;
      const isStackedArea = config.chartType === "Line" && config.fillLines && config.isStackedArea;

      if (isStacked100) {
        dataMin = 0; dataMax = 100;
      } else if (hierarchicalData) {
        if (config.isStacked) {
          hierarchicalData.bars.forEach(b => {
            let posSum = 0, negSum = 0;
            b.seriesValues.forEach(s => {
              if (s.val >= 0) posSum += s.val;
              else negSum += s.val;
            });
            if (posSum > dataMax) dataMax = posSum;
            if (negSum < dataMin) dataMin = negSum;
          });
        } else {
          hierarchicalData.bars.forEach(b => {
            b.seriesValues.forEach(s => {
              if (s.val > dataMax) dataMax = s.val;
              if (s.val < dataMin) dataMin = s.val;
            });
          });
        }
      } else {
        displayRows.forEach(r => {
          if (config.isStacked || isStackedArea) {
            let posSum = 0, negSum = 0;
            seriesCols.forEach(cIdx => {
              const rawCell = r[cIdx];
              if (!isEmptyValue(rawCell)) {
                const v = parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor;
                if (!isNaN(v)) {
                  if (v >= 0) posSum += v;
                  else negSum += v;
                }
              }
            });
            if (posSum > dataMax) dataMax = posSum;
            if (negSum < dataMin) dataMin = negSum;
          } else {
            seriesCols.forEach(cIdx => {
              const rawCell = r[cIdx];
              if (!isEmptyValue(rawCell)) {
                const v = parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor;
                if (!isNaN(v)) {
                  if (v > dataMax) dataMax = v;
                  if (v < dataMin) dataMin = v;
                }
              }
            });
          }
        });
      }

      const yScaleInfo = computeYScale(dataMin, dataMax, config.yDivisions, config.yScaleRounding || config.forceRoundScale, config.customYRange, config.customMinY, config.customMaxY, config.customYStep);
      const minY = yScaleInfo.minY, maxY = yScaleInfo.maxY, yTicks = yScaleInfo.ticks;

      // Beräkna exakt högerställd Y-axelskala med en säker vänstermarginal som aldrig skärs av i PDF
      const padLeft_base = isPrint ? 4 : 2;
      let padLeft = padLeft_base;
      let yLabelAnchorX = padLeft_base;

      if (isHorizontal) {
        let snugCatW;
        const catCharWidth = isPrint ? (catFontSize * 0.60) : 8.5;
        if (hierarchicalData && config.useHierarchy) {
          const maxSubLen = Math.max(...hierarchicalData.bars.map(b => (b.subLabel || "").length), 4);
          const maxParentLen = Math.max(...hierarchicalData.groups.map(g => (g.parentLabel || "").length), 4);
          snugCatW = Math.ceil((maxSubLen + maxParentLen) * catCharWidth + (isPrint ? 36 : 28));
        } else if (hierarchicalData) {
          const maxLabelLen = Math.max(...hierarchicalData.bars.map(b => {
            const p = b.parentLabel && b.parentLabel !== b.subLabel ? b.parentLabel + " " : "";
            return (p + (b.subLabel || "")).length;
          }), 5);
          snugCatW = Math.ceil(maxLabelLen * catCharWidth + (isPrint ? 16 : 10));
        } else {
          const maxCatLen = Math.max(...displayRows.map(r => String(r[catColIdx] || "").length), 5);
          snugCatW = Math.ceil(maxCatLen * catCharWidth + (isPrint ? 16 : 10));
        }
        padLeft = Math.min(Math.max(isPrint ? 64 : 48, snugCatW), width * 0.48);
      } else if (config.drawYLabels) {
        const formattedSample = yTicks.map(t => formatValue(t.val, "", yScaleInfo.decimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnAxis ? config.valuePrefix : "", config.unitOnAxis ? config.valueSuffix : ""));
        const maxCharLen = Math.max(...formattedSample.map(s => String(s).length), 2);
        const axisCharWidth = isPrint ? (axisFontSize * 0.60) : 8.5;
        const widestTextWidth = Math.ceil(maxCharLen * axisCharWidth);
        const gapToAxis = isPrint ? 8 : 6;
        padLeft = padLeft_base + widestTextWidth + gapToAxis;
        yLabelAnchorX = padLeft - gapToAxis;
      }

      const padRight = isHorizontal ? 32 : (config.showValueLabels !== false ? 24 : 16);
      const padTop = 36;
      const isHierClustered = Boolean(config.useHierarchy && hierarchicalData);
      const padBottom = isHorizontal ? 28 : (config.drawXLabels !== false ? (isHierClustered ? (isPrint ? 74 : 66) : (isPrint ? 32 : 28)) : 8);
const plotW = Math.max(10, width - padLeft - padRight);
      const plotH = Math.max(10, height - padTop - padBottom);

      const visibleXIndices = useMemo(() => {
        const set = new Set<number>();
        if (!displayRows || !displayRows.length || config.drawXLabels === false) return set;
        const N = displayRows.length;
        if (isHorizontal) {
          for (let i = 0; i < N; i++) set.add(i);
          return set;
        }

        const dec = config.xLabelDecimation || "Auto";
        if (dec === "All") {
          for (let i = 0; i < N; i++) set.add(i);
          return set;
        }
        if (dec === "FirstLast") {
          set.add(0);
          if (N > 1) set.add(N - 1);
          return set;
        }

        // Exakt breddberäkning för kollisionsfri X-etikettutglesning
        const charW = isPrint ? (catFontSize * 0.60) : 8.5;
        const maxLabelLen = Math.max(...displayRows.map((r, i) => (getFormattedXLabel(r[catColIdx], i) || "").length), 3);
        const estLabelW = maxLabelLen * charW;
        const minGap = isPrint ? 20 : 14;
        const slotNeeded = estLabelW + minGap;
        const slotPerIndex = Math.max(1, plotW / Math.max(1, config.chartType === "Line" ? (N - 1) : N));
        const minIndexStep = Math.max(1, Math.ceil(slotNeeded / slotPerIndex));

        if (dec === "Auto") {
          if (minIndexStep <= 1) {
            for (let i = 0; i < N; i++) set.add(i);
          } else {
            const niceSteps = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 50, 100];
            const step = niceSteps.find(s => s >= minIndexStep) || minIndexStep;
            for (let i = 0; i < N; i += step) {
              set.add(i);
            }
            if (!set.has(N - 1)) {
              const arr = Array.from(set).sort((a, b) => a - b);
              const last = arr[arr.length - 1];
              if ((N - 1 - last) * slotPerIndex < slotNeeded) {
                set.delete(last);
              }
              set.add(N - 1);
            }
          }
          return set;
        }

        if (dec === "Max5" || dec === "Max7") {
          const maxCount = dec === "Max5" ? 5 : 7;
          const targetStep = Math.max(minIndexStep, Math.ceil((N - 1) / (maxCount - 1)));
          for (let i = 0; i < N; i += targetStep) {
            set.add(i);
          }
          if (!set.has(N - 1)) {
            const arr = Array.from(set).sort((a, b) => a - b);
            const last = arr[arr.length - 1];
            if ((N - 1 - last) * slotPerIndex < slotNeeded) {
              set.delete(last);
            }
            set.add(N - 1);
          }
          return set;
        }

        if (dec === "Every2" || dec === "Every3" || dec === "Every5") {
          const step = dec === "Every2" ? 2 : (dec === "Every3" ? 3 : 5);
          for (let i = 0; i < N; i += step) {
            set.add(i);
          }
          if (!set.has(N - 1)) {
            const arr = Array.from(set).sort((a, b) => a - b);
            const last = arr[arr.length - 1];
            if ((N - 1 - last) * slotPerIndex < slotNeeded) {
              set.delete(last);
            }
            set.add(N - 1);
          }
          return set;
        }

        if (dec === "MonthChange") {
          let lastMonth = null;
          let lastAddedIdx = -999;
          displayRows.forEach((r, i) => {
            const pDate = parsedDates[i];
            if (pDate && pDate.month !== lastMonth) {
              if ((i - lastAddedIdx) * slotPerIndex >= slotNeeded) {
                set.add(i);
                lastAddedIdx = i;
                lastMonth = pDate.month;
              }
            } else if (!pDate) {
              if ((i - lastAddedIdx) * slotPerIndex >= slotNeeded) {
                set.add(i);
                lastAddedIdx = i;
              }
            }
          });
          return set;
        }

        for (let i = 0; i < N; i++) set.add(i);
        return set;
      }, [displayRows, config.xLabelDecimation, config.drawXLabels, isHorizontal, parsedDates, plotW, catColIdx, catFontSize, isPrint, config.chartType]);

      if (!hasValidData) {
        return (
          <div className="w-full h-full flex items-center justify-center border border-dashed text-slate-400 text-sm">
            Ingen data att visa
          </div>
        );
      }

      const zeroY = padTop + plotH - ((0 - minY) / (maxY - minY || 1)) * plotH;
      const zeroX = padLeft + ((0 - minY) / (maxY - minY || 1)) * plotW;
      const axisY = (config.axisPosition === "bottom" || minY >= 0) ? (padTop + plotH) : zeroY;
      const axisX = (config.axisPosition === "bottom" || minY >= 0) ? padLeft : zeroX;

      const gridDash = config.gridLineStyle === "Dotted" ? "2 3" : (config.gridLineStyle === "Solid" ? "none" : "4 4");
      const gridW = config.gridLineWidth || 1;
      const gridOpacity = (config.gridOpacity !== undefined ? config.gridOpacity : 100) / 100;
      const gridCol = isDark ? "#334155" : (config.gridColor || "#cbd5e1");
      const axisLineCol = isDark ? "#94a3b8" : "#1a1a1a";
      const xLabelColor = isDark ? "#f8fafc" : "#1a1a1a";
      const valueLabelColor = isDark ? "#f8fafc" : "#1a1a1a";

      const handleHover = (e, rowData, color, seriesName, val) => {
        setHoveredData({ clientX: e.clientX, clientY: e.clientY, row: rowData, color, seriesName, val });
      };

      const handleBarClick = (e, _catName?, _sName?, _currentColor?) => {
        if (isViewerMode || !onElementClick) return;
        e.stopPropagation();
        onElementClick('color');
      };

      return (
        <div className="w-full h-full relative" style={{ margin: 0, padding: 0 }}>
          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            style={{ width: "100%", height: `${height}px`, display: "block" }}
            className="select-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {config.chartType !== "Pie" && (
              <g className={!isViewerMode && onElementClick ? "cursor-pointer" : undefined} onClick={() => !isViewerMode && onElementClick && onElementClick('grid')}>
                {isHorizontal ? (
                  <>
                    {/* Horisontella avdelare / X-stödlinjer för liggande diagram */}
                    {config.xTickStyle === "Full Grid" && (
                      hierarchicalData ? (
                        hierarchicalData.bars.map((b, i) => {
                          if (i === hierarchicalData.bars.length - 1) return null;
                          const nextB = hierarchicalData.bars[i + 1];
                          const divY = (b.y + b.h + nextB.y) / 2;
                          return (<line key={`h-grid-hier-${i}`} x1={padLeft} y1={divY} x2={padLeft + plotW} y2={divY} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />);
                        })
                      ) : (
                        displayRows.map((_, rIdx) => {
                          const catSlotH = plotH / (displayRows.length || 1);
                          const lineY = padTop + (rIdx + 1) * catSlotH;
                          if (rIdx === displayRows.length - 1) return null;
                          return (<line key={`h-grid-${rIdx}`} x1={padLeft} y1={lineY} x2={padLeft + plotW} y2={lineY} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />);
                        })
                      )
                    )}
                    {config.xTickStyle === "Short Ticks" && (
                      hierarchicalData ? (
                        hierarchicalData.bars.map((b, i) => (
                          <line key={`h-tick-hier-${i}`} x1={padLeft - 6} y1={b.centerY} x2={padLeft} y2={b.centerY} stroke={axisLineCol} strokeWidth="1.5" />
                        ))
                      ) : (
                        displayRows.map((_, rIdx) => {
                          const catSlotH = plotH / (displayRows.length || 1);
                          const catCenterY = padTop + (rIdx + 0.5) * catSlotH;
                          return (<line key={`h-tick-${rIdx}`} x1={padLeft - 6} y1={catCenterY} x2={padLeft} y2={catCenterY} stroke={axisLineCol} strokeWidth="1.5" />);
                        })
                      )
                    )}

                    {/* Värdeaxelns stödlinjer (lodräta) */}
                    {yTicks.map(({ pct, val }, idx) => {
                      const xPos = padLeft + (1 - pct) * plotW;
                      return (
                        <g key={idx}>
                          {config.yTickStyle === "Full Grid" && (<line x1={xPos} y1={padTop} x2={xPos} y2={padTop + plotH} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />)}
                          {config.yTickStyle === "Short Ticks" && (<line x1={xPos} y1={padTop + plotH} x2={xPos} y2={padTop + plotH + 6} stroke={axisLineCol} strokeWidth="1.5" />)}
                          {config.drawYLabels && (
                            <text x={xPos} y={padTop + plotH + (isPrint ? 24 : 18)} textAnchor="middle" fontSize={axisFontSize} fill={xLabelColor} fontWeight={config.axisWeight || 400}>
                              {formatValue(val, "", yScaleInfo.decimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {/* X-stödlinjer för stående diagram (linje, stapel, hierarki) */}
                    {config.chartType === "Line" ? (
                      displayRows.map((_, i) => {
                        const N = Math.max(displayRows.length - 1, 1);
                        const xPos = padLeft + (i / N) * plotW;
                        return (
                          <g key={`x-tick-line-${i}`}>
                            {config.xTickStyle === "Full Grid" && (
                              <line x1={xPos} y1={padTop} x2={xPos} y2={padTop + plotH} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />
                            )}
                            {config.xTickStyle === "Short Ticks" && (
                              <line x1={xPos} y1={padTop + plotH} x2={xPos} y2={padTop + plotH + 6} stroke={axisLineCol} strokeWidth="1.5" />
                            )}
                          </g>
                        );
                      })
                    ) : hierarchicalData ? (
                      hierarchicalData.bars.map((b, i) => (
                        <g key={`x-tick-hier-${i}`}>
                          {config.xTickStyle === "Full Grid" && i < hierarchicalData.bars.length - 1 && (() => {
                            const nextB = hierarchicalData.bars[i + 1];
                            const divX = (b.x + b.w + nextB.x) / 2;
                            return (
                              <line x1={divX} y1={padTop} x2={divX} y2={padTop + plotH} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />
                            );
                          })()}
                          {config.xTickStyle === "Short Ticks" && (
                            <line x1={b.centerX} y1={padTop + plotH} x2={b.centerX} y2={padTop + plotH + 6} stroke={axisLineCol} strokeWidth="1.5" />
                          )}
                        </g>
                      ))
                    ) : (
                      displayRows.map((_, rIdx) => {
                        const catSlotW = plotW / (displayRows.length || 1);
                        const divX = padLeft + (rIdx + 1) * catSlotW;
                        const catCenterX = padLeft + (rIdx + 0.5) * catSlotW;
                        return (
                          <g key={`x-tick-bar-${rIdx}`}>
                            {config.xTickStyle === "Full Grid" && rIdx < displayRows.length - 1 && (
                              <line x1={divX} y1={padTop} x2={divX} y2={padTop + plotH} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />
                            )}
                            {config.xTickStyle === "Short Ticks" && (
                              <line x1={catCenterX} y1={padTop + plotH} x2={catCenterX} y2={padTop + plotH + 6} stroke={axisLineCol} strokeWidth="1.5" />
                            )}
                          </g>
                        );
                      })
                    )}

                    {/* Y-axelns stödlinjer (vågräta) */}
                    {yTicks.map(({ pct, val }, idx) => {
                      const yPos = padTop + pct * plotH;
                      return (
                        <g key={idx}>
                          {config.yTickStyle === "Full Grid" && (<line x1={padLeft} y1={yPos} x2={padLeft + plotW} y2={yPos} stroke={gridCol} strokeWidth={gridW} strokeDasharray={gridDash} strokeOpacity={gridOpacity} />)}
                          {config.yTickStyle === "Short Ticks" && (<line x1={padLeft} y1={yPos} x2={padLeft - 6} y2={yPos} stroke={axisLineCol} strokeWidth="1.5" />)}
                          {config.drawYLabels && (
                            <text 
                              x={yLabelAnchorX} 
                              y={yPos + 4} 
                              textAnchor="end" 
                              fontSize={axisFontSize} 
                              fill={xLabelColor} 
                              fontWeight={config.axisWeight || 400}
                            >
                              {formatValue(val, "", yScaleInfo.decimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnAxis ? config.valuePrefix : "", config.unitOnAxis ? config.valueSuffix : "")}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                )}
              </g>
            )}

            {/* 1. VERTICAL BAR CHART */}
            {config.chartType === "Bar" && !isHorizontal && (() => {
              const barRects = [];
              const barLabels = [];
              const catLabels = [];

              if (hierarchicalData) {
                const isHierClustered = Boolean(config.useHierarchy);
                const G = hierarchicalData.groups.length;
                const B = hierarchicalData.bars.length;
                const groupGap = (isHierClustered && G > 1) ? Math.max(24, Math.min(60, plotW * 0.08)) : (isHierClustered ? 0 : Math.max(4, Math.min(16, plotW * 0.02)));
                const subGap = isHierClustered ? Math.max(3, Math.min(10, plotW * 0.012)) : groupGap;
                const totalGroupGaps = (G - 1) * groupGap;
                const totalSubGaps = hierarchicalData.groups.reduce((acc, g) => acc + (g.bars.length - 1) * subGap, 0);
                const rawBarW = Math.max(12, (plotW - totalGroupGaps - totalSubGaps) / (B || 1));
                const barW = Math.min(rawBarW, Math.max(12, rawBarW * ((config.barWidthPct || 100) / 100)));
                const clusterContentW = B * barW + totalGroupGaps + totalSubGaps;
                const startX = padLeft + Math.max(0, (plotW - clusterContentW) / 2);

                let curX = startX;
                hierarchicalData.groups.forEach(g => {
                  const gStartX = curX;
                  g.bars.forEach((bar, bIdx) => {
                    bar.x = curX;
                    bar.w = barW;
                    bar.centerX = curX + barW / 2;
                    curX += barW;
                    if (bIdx < g.bars.length - 1) {
                      curX += subGap;
                    }
                  });
                  g.startX = gStartX;
                  g.endX = curX;
                  g.centerX = (g.startX + g.endX) / 2;
                  curX += groupGap;
                });

                hierarchicalData.bars.forEach((bar) => {
                  if (config.isStacked) {
                    let runningPosH = 0;
                    let runningNegH = 0;
                    let posSum = 0;
                    let negSum = 0;

                    bar.seriesValues.forEach((s) => {
                      if (isNaN(s.val) || s.val === 0) return;
                      const absVal = Math.abs(s.val);
                      const barH = (absVal / (maxY - minY || 1)) * plotH;
                      const baseStartY = minY >= 0 ? (padTop + plotH) : zeroY;
                      let barY;
                      if (s.val > 0) {
                        barY = baseStartY - runningPosH - barH;
                        runningPosH += barH;
                        posSum += s.val;
                      } else {
                        barY = baseStartY + runningNegH;
                        runningNegH += barH;
                        negSum += s.val;
                      }

                      barRects.push(
                        <rect
                          key={`hier-rect-${bar.barIndex}-${s.sName}`}
                          x={bar.x}
                          y={barY}
                          width={bar.w}
                          height={Math.max(barH, 0.5)}
                          fill={s.color}
                          className="transition-all hover:opacity-85 cursor-pointer"
                          onClick={(e) => handleBarClick(e, bar.subLabel || bar.parentLabel, s.sName, s.color)}
                          onMouseMove={(e) => handleHover(e, bar.rowRef || [bar.parentLabel + " " + bar.subLabel], s.color, s.sName, s.val)}
                          onMouseLeave={() => setHoveredData(null)}
                        />
                      );

                      if (config.showStackedSegmentLabels && barH >= 18) {
                        barLabels.push(
                          <text
                            key={`hier-seg-${bar.barIndex}-${s.sName}`}
                            x={bar.centerX}
                            y={barY + barH / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={segFontSize}
                            fill={getContrastColor(s.color)}
                            fontWeight="700"
                            style={{ pointerEvents: 'none' }}
                          >
                            {formatValue(s.val, s.sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                          </text>
                        );
                      }
                    });

                    if (config.showStackedTotal !== false && runningPosH > 0) {
                      const isVerticalVal = config.valueOrientation === "vertical";
                      const totalY = zeroY - runningPosH - 8;
                      barLabels.push(
                        <text
                          key={`hier-tot-pos-${bar.barIndex}`}
                          x={bar.centerX}
                          y={totalY}
                          textAnchor={isVerticalVal ? "start" : "middle"}
                          dominantBaseline={isVerticalVal ? "central" : "auto"}
                          transform={isVerticalVal ? `rotate(-90, ${bar.centerX}, ${totalY})` : undefined}
                          fontSize={totalFontSize}
                          fill={valueLabelColor}
                          fontWeight={config.valueWeight}
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(posSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                        </text>
                      );
                    }
                    if (config.showStackedTotal !== false && runningNegH > 0) {
                      const isVerticalVal = config.valueOrientation === "vertical";
                      const totalY = zeroY + runningNegH + 14;
                      barLabels.push(
                        <text
                          key={`hier-tot-neg-${bar.barIndex}`}
                          x={bar.centerX}
                          y={totalY}
                          textAnchor={isVerticalVal ? "end" : "middle"}
                          dominantBaseline={isVerticalVal ? "central" : "auto"}
                          transform={isVerticalVal ? `rotate(-90, ${bar.centerX}, ${totalY})` : undefined}
                          fontSize={totalFontSize}
                          fill={valueLabelColor}
                          fontWeight={config.valueWeight}
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(negSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                        </text>
                      );
                    }
                  } else {
                    const K = bar.seriesValues.length;
                    const innerGap = K > 1 ? Math.max(1, Math.min(4, bar.w * 0.05)) : 0;
                    const singleSBarW = K > 1 ? (bar.w - (K - 1) * innerGap) / K : bar.w;
                    bar.seriesValues.forEach((s, sIdx) => {
                      const sbX = bar.x + sIdx * (singleSBarW + innerGap);
                      let barH, barY;
                      if (minY >= 0) {
                        barH = Math.max(0.5, ((s.val - minY) / (maxY - minY || 1)) * plotH);
                        barY = padTop + plotH - barH;
                      } else if (maxY <= 0) {
                        barH = Math.max(0.5, ((minY - s.val) / (maxY - minY || 1)) * plotH);
                        barY = padTop;
                      } else {
                        const absVal = Math.abs(s.val);
                        barH = Math.max(0.5, (absVal / (maxY - minY || 1)) * plotH);
                        barY = s.val >= 0 ? (zeroY - barH) : zeroY;
                      }
                      const sbCenterX = sbX + singleSBarW / 2;

                      barRects.push(
                        <rect
                          key={`hier-rect-${bar.barIndex}-${s.sName}`}
                          x={sbX}
                          y={barY}
                          width={singleSBarW}
                          height={Math.max(barH, 0.5)}
                          fill={s.color}
                          className="transition-all hover:opacity-85 cursor-pointer"
                          onClick={(e) => handleBarClick(e, bar.subLabel || bar.parentLabel, s.sName, s.color)}
                          onMouseMove={(e) => handleHover(e, bar.rowRef || [bar.parentLabel + " " + bar.subLabel], s.color, s.sName, s.val)}
                          onMouseLeave={() => setHoveredData(null)}
                        />
                      );

                      if (s.val !== 0 && !isNaN(s.val) && config.showValueLabels !== false) {
                        const isVerticalVal = config.valueOrientation === "vertical";
                        const valY = s.val >= 0 ? (barY - 8) : (barY + barH + 14);
                        barLabels.push(
                          <text
                            key={`hier-val-${bar.barIndex}-${s.sName}`}
                            x={sbCenterX}
                            y={valY}
                            textAnchor={isVerticalVal ? (s.val >= 0 ? "start" : "end") : "middle"}
                            dominantBaseline={isVerticalVal ? "central" : "auto"}
                            transform={isVerticalVal ? `rotate(-90, ${sbCenterX}, ${valY})` : undefined}
                            fontSize={valFontSize}
                            fill={valueLabelColor}
                            fontWeight={config.valueWeight}
                            style={{ pointerEvents: 'none' }}
                          >
                            {formatValue(s.val, s.sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                          </text>
                        );
                      }
                    });
                  }
                });

                if (config.drawXLabels !== false) {
                  // Tier 1: Subcategory under each bar (or combined if hierarchy clustering is off)
                  hierarchicalData.bars.forEach((bar) => {
                    const rawText = !isHierClustered && bar.parentLabel && bar.parentLabel !== bar.subLabel
                      ? `${bar.parentLabel} ${bar.subLabel}`
                      : String(bar.subLabel || "").trim();
                    const words = rawText.split(/\s+/);
                    let lines = [rawText];
                    if (words.length === 2 && rawText.length > 7) {
                      lines = [words[0], words[1]];
                    } else if (words.length > 2) {
                      const mid = Math.ceil(words.length / 2);
                      lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
                    }

                    catLabels.push(
                      <text
                        key={`hier-sub-${bar.barIndex}`}
                        x={bar.centerX}
                        y={padTop + plotH + 16}
                        textAnchor="middle"
                        fontSize={catFontSize * 0.92}
                        fill={xLabelColor}
                        fontWeight={config.categoryWeight || 400}
                      >
                        {lines.map((line, lIdx) => (
                          <tspan
                            key={lIdx}
                            x={bar.centerX}
                            dy={lIdx === 0 ? 0 : (catFontSize * 1.05)}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    );
                  });

                  // Tier 2: Parent Category centered under each parent group (rendered ONLY when isHierClustered is true)
                  if (isHierClustered) {
                    hierarchicalData.groups.forEach((g, gIdx) => {
                      catLabels.push(
                        <text
                          key={`hier-parent-${gIdx}`}
                          x={g.centerX}
                          y={padTop + plotH + (isPrint ? 56 : 50)}
                          textAnchor="middle"
                          fontSize={catFontSize * 1.25}
                          fill={xLabelColor}
                          fontWeight="700"
                        >
                          {g.parentLabel}
                        </text>
                      );
                    });
                  }
                }

                return (
                  <g>
                    <g className="bars-layer">{barRects}</g>
                    <g className="value-labels-layer">{barLabels}</g>
                    <g className="categories-layer">{catLabels}</g>
                    {minY < 0 && <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke={axisLineCol} strokeWidth={1.5} strokeDasharray={config.axisPosition === "bottom" ? "3 3" : undefined} />}
                    {config.drawXAxis && <line x1={padLeft} y1={axisY} x2={padLeft + plotW} y2={axisY} stroke={axisLineCol} strokeWidth={config.xAxisWidth || 2.5} />}
                  </g>
                );
              }

              displayRows.forEach((row, rIdx) => {
                const catSlotW = plotW / (displayRows.length || 1);
                const catX = padLeft + rIdx * catSlotW;
                const catCenterX = catX + catSlotW / 2;
                const usableSlotW = catSlotW * (1 - config.barGapPct / 100);
                const clusterW = usableSlotW * (config.barWidthPct / 100);
                const K = seriesCols.length;

                if (config.isStacked) {
                  let runningPosH = 0;
                  let runningNegH = 0;
                  let posSum = 0;
                  let negSum = 0;

                  seriesCols.forEach(colIdx => {
                    const sName = headers[colIdx];
                    const rawVal = parseVal(row[colIdx], config.dataDecSep, config.dataThousandSep) / divisor;
                    if (isNaN(rawVal) || rawVal === 0) return;
                    const absVal = Math.abs(rawVal);
                    const barH = (absVal / (maxY - minY || 1)) * plotH;
                    const defaultColor = seriesColors[sName] || BRAND_SWATCHES[0];
                    const color = getItemColor(row[catColIdx], sName, defaultColor, config.categoryColorOverrides);
                    const barX = catCenterX - clusterW / 2;

                    const baseStartY = minY >= 0 ? (padTop + plotH) : zeroY;
                    let barY;
                    if (rawVal > 0) {
                      barY = baseStartY - runningPosH - barH;
                      runningPosH += barH;
                      posSum += rawVal;
                    } else {
                      barY = baseStartY + runningNegH;
                      runningNegH += barH;
                      negSum += rawVal;
                    }

                    barRects.push(
                      <rect
                        key={`rect-${rIdx}-${sName}`}
                        x={barX}
                        y={barY}
                        width={clusterW}
                        height={Math.max(barH, 0.5)}
                        fill={color}
                        className="transition-all hover:opacity-85 cursor-pointer"
                        onClick={(e) => handleBarClick(e, row[catColIdx], sName, color)}
                        onMouseMove={(e) => handleHover(e, row, color, sName, rawVal)}
                        onMouseLeave={() => setHoveredData(null)}
                      />
                    );

                    if (config.showStackedSegmentLabels && barH >= 18) {
                      barLabels.push(
                        <text
                          key={`seg-${rIdx}-${sName}`}
                          x={catCenterX}
                          y={barY + barH / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={segFontSize}
                          fill={getContrastColor(color)}
                          fontWeight="700"
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(rawVal, sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                        </text>
                      );
                    }
                  });

                  if (config.showStackedTotal !== false && runningPosH > 0) {
                    const isVerticalVal = config.valueOrientation === "vertical";
                    const totalY = zeroY - runningPosH - 8;
                    barLabels.push(
                      <text
                        key={`tot-pos-${rIdx}`}
                        x={catCenterX}
                        y={totalY}
                        textAnchor={isVerticalVal ? "start" : "middle"}
                        dominantBaseline={isVerticalVal ? "central" : "auto"}
                        transform={isVerticalVal ? `rotate(-90, ${catCenterX}, ${totalY})` : undefined}
                        fontSize={totalFontSize}
                        fill={valueLabelColor}
                        fontWeight={config.valueWeight}
                        style={{ pointerEvents: 'none' }}
                      >
                        {formatValue(posSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                      </text>
                    );
                  }
                  if (config.showStackedTotal !== false && runningNegH > 0) {
                    const isVerticalVal = config.valueOrientation === "vertical";
                    const totalY = zeroY + runningNegH + 14;
                    barLabels.push(
                      <text
                        key={`tot-neg-${rIdx}`}
                        x={catCenterX}
                        y={totalY}
                        textAnchor={isVerticalVal ? "end" : "middle"}
                        dominantBaseline={isVerticalVal ? "central" : "auto"}
                        transform={isVerticalVal ? `rotate(-90, ${catCenterX}, ${totalY})` : undefined}
                        fontSize={totalFontSize}
                        fill={valueLabelColor}
                        fontWeight={config.valueWeight}
                        style={{ pointerEvents: 'none' }}
                      >
                        {formatValue(negSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                      </text>
                    );
                  }
                } else {
                  const innerGapPx = K > 1 ? (clusterW * ((config.innerBarGapPct || 0) / 100)) / (K - 1) : 0;
                  const singleBarW = K > 1 ? (clusterW - (K - 1) * innerGapPx) / K : clusterW;
                  const clusterStartX = catCenterX - clusterW / 2;

                  seriesCols.forEach((colIdx, aIdx) => {
                    const sName = headers[colIdx];
                    const val = parseVal(row[colIdx], config.dataDecSep, config.dataThousandSep) / divisor;
                    const barX = clusterStartX + aIdx * (singleBarW + innerGapPx);
                    let barH, barY;
                    if (minY >= 0) {
                      barH = Math.max(0.5, ((val - minY) / (maxY - minY || 1)) * plotH);
                      barY = padTop + plotH - barH;
                    } else if (maxY <= 0) {
                      barH = Math.max(0.5, ((minY - val) / (maxY - minY || 1)) * plotH);
                      barY = padTop;
                    } else {
                      const absVal = Math.abs(val);
                      barH = Math.max(0.5, (absVal / (maxY - minY || 1)) * plotH);
                      barY = val >= 0 ? (zeroY - barH) : zeroY;
                    }
                    const defaultColor = seriesColors[sName] || BRAND_SWATCHES[aIdx % BRAND_SWATCHES.length];
                    const color = getItemColor(row[catColIdx], sName, defaultColor, config.categoryColorOverrides);
                    const barCenterX = barX + singleBarW / 2;

                    barRects.push(
                      <rect
                        key={`rect-${rIdx}-${sName}`}
                        x={barX}
                        y={barY}
                        width={singleBarW}
                        height={Math.max(barH, 0.5)}
                        fill={color}
                        className="transition-all hover:opacity-85 cursor-pointer"
                        onClick={(e) => handleBarClick(e, row[catColIdx], sName, color)}
                        onMouseMove={(e) => handleHover(e, row, color, sName, val)}
                        onMouseLeave={() => setHoveredData(null)}
                      />
                    );

                    if (val !== 0 && !isNaN(val) && shouldShowVal(rIdx, colIdx, val, row[catColIdx])) {
                      const isVerticalVal = config.valueOrientation === "vertical";
                      const valY = val >= 0 ? (barY - 8) : (barY + barH + 14);
                      barLabels.push(
                        <text
                          key={`val-${rIdx}-${sName}`}
                          x={barCenterX}
                          y={valY}
                          textAnchor={isVerticalVal ? (val >= 0 ? "start" : "end") : "middle"}
                          dominantBaseline={isVerticalVal ? "central" : "auto"}
                          transform={isVerticalVal ? `rotate(-90, ${barCenterX}, ${valY})` : undefined}
                          fontSize={valFontSize}
                          fill={valueLabelColor}
                          fontWeight={config.valueWeight}
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(val, sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                        </text>
                      );
                    }
                  });
                }

                if (config.drawXLabels !== false && visibleXIndices.has(rIdx)) {
                  catLabels.push(
                    <text
                      key={`cat-${rIdx}`}
                      x={catCenterX}
                      y={padTop + plotH + 20}
                      textAnchor="middle"
                      fontSize={catFontSize}
                      fill={xLabelColor}
                      fontWeight={config.categoryWeight || 400}
                    >
                      {getFormattedXLabel(row[catColIdx], rIdx)}
                    </text>
                  );
                }
              });

              return (
                <g>
                  <g className="bars-layer">{barRects}</g>
                  <g className="value-labels-layer">{barLabels}</g>
                  <g className="categories-layer">{catLabels}</g>
                  {minY < 0 && <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke={axisLineCol} strokeWidth={1.5} strokeDasharray={config.axisPosition === "bottom" ? "3 3" : undefined} />}
                  {config.drawXAxis && <line x1={padLeft} y1={axisY} x2={padLeft + plotW} y2={axisY} stroke={axisLineCol} strokeWidth={config.xAxisWidth || 2.5} />}
                </g>
              );
            })()}

            {/* 2. HORIZONTAL BAR CHART */}
            {config.chartType === "Bar" && isHorizontal && (() => {
              const barRects = [];
              const barLabels = [];
              const catLabels = [];
              const hCatAlign = config.hCatAlign || "left";
                  
        if (hierarchicalData) {
          const isHierClustered = Boolean(config.useHierarchy);
          const G = hierarchicalData.groups.length;
          const B = hierarchicalData.bars.length;
          const groupGap = (isHierClustered && G > 1) ? Math.max(16, Math.min(40, plotH * 0.06)) : (isHierClustered ? 0 : Math.max(2, Math.min(10, plotH * 0.015)));
          const subGap = isHierClustered ? Math.max(2, Math.min(8, plotH * 0.012)) : groupGap;
          const totalGroupGaps = (G - 1) * groupGap;
          const totalSubGaps = hierarchicalData.groups.reduce((acc, g) => acc + (g.bars.length - 1) * subGap, 0);
          const rawBarH = Math.max(8, (plotH - totalGroupGaps - totalSubGaps) / (B || 1));
          const barH = Math.min(rawBarH, Math.max(8, rawBarH * ((config.barWidthPct || 100) / 100)));
          const clusterContentH = B * barH + totalGroupGaps + totalSubGaps;
          const startY = padTop + Math.max(0, (plotH - clusterContentH) / 2);

          let curY = startY;
          hierarchicalData.groups.forEach(g => {
            const gStartY = curY;
            g.bars.forEach((bar, bIdx) => {
              bar.y = curY;
              bar.h = barH;
              bar.centerY = curY + barH / 2;
              curY += barH;
              if (bIdx < g.bars.length - 1) {
                curY += subGap;
              }
            });
            g.startY = gStartY;
            g.endY = curY;
            g.centerY = (g.startY + g.endY) / 2;
            curY += groupGap;
          });

        hierarchicalData.bars.forEach((bar) => {
          if (config.isStacked) {
            let runningPosW = 0;
            let runningNegW = 0;
            let posSum = 0;
            let negSum = 0;

            bar.seriesValues.forEach((s) => {
              if (isNaN(s.val) || s.val === 0) return;
              const absVal = Math.abs(s.val);
              const segW = (absVal / (maxY - minY || 1)) * plotW;
              const barY = bar.y;

              const baseStartX = minY >= 0 ? padLeft : zeroX;
              let barX;
              if (s.val > 0) {
                barX = baseStartX + runningPosW;
                runningPosW += segW;
                posSum += s.val;
              } else {
                barX = baseStartX - runningNegW - segW;
                runningNegW += segW;
                negSum += s.val;
              }

              barRects.push(
                <rect
                  key={`hier-h-rect-${bar.barIndex}-${s.sName}`}
                  x={barX}
                  y={barY}
                  width={Math.max(segW, 0.5)}
                  height={Math.max(bar.h, 1)}
                  fill={s.color}
                  className="transition-all hover:opacity-85 cursor-pointer"
                  onClick={(e) => handleBarClick(e, bar.subLabel || bar.parentLabel, s.sName, s.color)}
                  onMouseMove={(e) => handleHover(e, bar.rowRef || [bar.parentLabel + " " + bar.subLabel], s.color, s.sName, s.val)}
                  onMouseLeave={() => setHoveredData(null)}
                />
              );

              if (config.showStackedSegmentLabels && segW > 28) {
                barLabels.push(
                  <text
                    key={`hier-h-seg-${bar.barIndex}-${s.sName}`}
                    x={barX + segW / 2}
                    y={bar.centerY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={segFontSize}
                    fill={getContrastColor(s.color)}
                    fontWeight="700"
                    style={{ pointerEvents: 'none' }}
                  >
                    {formatValue(s.val, s.sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                  </text>
                );
              }
            });

            if (config.showStackedTotal !== false && runningPosW > 0) {
              barLabels.push(
                <text
                  key={`hier-h-tot-pos-${bar.barIndex}`}
                  x={zeroX + runningPosW + 8}
                  y={bar.centerY}
                  textAnchor="start"
                  dominantBaseline="central"
                  fontSize={totalFontSize}
                  fill={valueLabelColor}
                  fontWeight={config.valueWeight}
                  style={{ pointerEvents: 'none' }}
                >
                  {formatValue(posSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                </text>
              );
            }
            if (config.showStackedTotal !== false && runningNegW > 0) {
              barLabels.push(
                <text
                  key={`hier-h-tot-neg-${bar.barIndex}`}
                  x={zeroX - runningNegW - 8}
                  y={bar.centerY}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={totalFontSize}
                  fill={valueLabelColor}
                  fontWeight={config.valueWeight}
                  style={{ pointerEvents: 'none' }}
                >
                  {formatValue(negSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                </text>
              );
            }
          } else {
            const K = bar.seriesValues.length;
            const innerGap = K > 1 ? Math.max(1, Math.min(4, bar.h * 0.05)) : 0;
            const singleSBarH = K > 1 ? (bar.h - (K - 1) * innerGap) / K : bar.h;

            bar.seriesValues.forEach((s, sIdx) => {
              const sbY = bar.y + sIdx * (singleSBarH + innerGap);
              let barW, barX;
              if (minY >= 0) {
                barW = Math.max(0.5, ((s.val - minY) / (maxY - minY || 1)) * plotW);
                barX = padLeft;
              } else if (maxY <= 0) {
                barW = Math.max(0.5, ((minY - s.val) / (maxY - minY || 1)) * plotW);
                barX = padLeft + plotW - barW;
              } else {
                const absVal = Math.abs(s.val);
                barW = Math.max(0.5, (absVal / (maxY - minY || 1)) * plotW);
                barX = s.val >= 0 ? zeroX : (zeroX - barW);
              }
              const sbCenterY = sbY + singleSBarH / 2;

              barRects.push(
                <rect
                  key={`hier-h-rect-${bar.barIndex}-${s.sName}`}
                  x={barX}
                  y={sbY}
                  width={Math.max(barW, 0.5)}
                  height={Math.max(singleSBarH, 1)}
                  fill={s.color}
                  className="transition-all hover:opacity-85 cursor-pointer"
                  onClick={(e) => handleBarClick(e, bar.subLabel || bar.parentLabel, s.sName, s.color)}
                  onMouseMove={(e) => handleHover(e, bar.rowRef || [bar.parentLabel + " " + bar.subLabel], s.color, s.sName, s.val)}
                  onMouseLeave={() => setHoveredData(null)}
                />
              );

              if (s.val !== 0 && !isNaN(s.val) && config.showValueLabels !== false) {
                const valX = s.val >= 0 ? (barX + barW + 8) : (barX - 8);
                const anchor = s.val >= 0 ? "start" : "end";
                barLabels.push(
                  <text
                    key={`hier-h-val-${bar.barIndex}-${s.sName}`}
                    x={valX}
                    y={sbCenterY}
                    textAnchor={anchor}
                    dominantBaseline="central"
                    fontSize={valFontSize}
                    fill={valueLabelColor}
                    fontWeight={config.valueWeight}
                    style={{ pointerEvents: 'none' }}
                  >
                    {formatValue(s.val, s.sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                  </text>
                );
              }
            });
          }
        });

        if (config.drawXLabels !== false) {
          // Nivå 1: Underkategori (eller kombinerad) precis bredvid stapeln
          hierarchicalData.bars.forEach((bar) => {
            const labelText = !isHierClustered && bar.parentLabel && bar.parentLabel !== bar.subLabel
              ? `${bar.parentLabel} ${bar.subLabel}`
              : bar.subLabel;
            catLabels.push(
              <text
                key={`hier-h-sub-${bar.barIndex}`}
                x={padLeft - 10}
                y={bar.centerY}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={catFontSize * 0.95}
                fill={xLabelColor}
                fontWeight={config.subCategoryWeight || 400}
              >
                {labelText}
              </text>
            );
          });

          // Nivå 2: Huvudkategori placerad längst till vänster, centrerad för hela gruppen (ENDAST vid aktiv hierarki)
          if (isHierClustered) {
            hierarchicalData.groups.forEach((g, gIdx) => {
              catLabels.push(
                <text
                  key={`hier-h-parent-${gIdx}`}
                  x={2}
                  y={g.centerY}
                  textAnchor="start"
                  dominantBaseline="central"
                  fontSize={catFontSize * 1.05}
                  fill={xLabelColor}
                  fontWeight="700"
                >
                  {g.parentLabel}
                </text>
              );
            });
          }
        }

        return (
          <g>
            <g className="bars-layer">{barRects}</g>
            <g className="value-labels-layer">{barLabels}</g>
            <g className="categories-layer">{catLabels}</g>
            {minY < 0 && <line x1={zeroX} y1={padTop} x2={zeroX} y2={padTop + plotH} stroke={axisLineCol} strokeWidth={1.5} strokeDasharray={config.axisPosition === "bottom" ? "3 3" : undefined} />}
            {config.drawXAxis && <line x1={axisX} y1={padTop} x2={axisX} y2={padTop + plotH} stroke={axisLineCol} strokeWidth={config.xAxisWidth || 2.5} />}
          </g>
        );
      }

              displayRows.forEach((row, rIdx) => {
                const catSlotH = plotH / (displayRows.length || 1);
                const catY = padTop + rIdx * catSlotH;
                const catCenterY = catY + catSlotH / 2;
                const usableSlotH = catSlotH * (1 - config.barGapPct / 100);
                const clusterH = usableSlotH * (config.barWidthPct / 100);
                const K = seriesCols.length;
                let runningStackW = 0, rowSum = 0;

                if (config.isStacked) {
                  let runningPosW = 0;
                  let runningNegW = 0;
                  let posSum = 0;
                  let negSum = 0;

                  seriesCols.forEach(colIdx => {
                    const sName = headers[colIdx];
                    const rawVal = parseVal(row[colIdx], config.dataDecSep, config.dataThousandSep) / divisor;
                    if (isNaN(rawVal) || rawVal === 0) return;
                    const absVal = Math.abs(rawVal);
                    const segW = (absVal / (maxY - minY || 1)) * plotW;
                    const defaultColor = seriesColors[sName] || BRAND_SWATCHES[0];
                    const color = getItemColor(row[catColIdx], sName, defaultColor, config.categoryColorOverrides);
                    const barY = catCenterY - clusterH / 2;

                    const baseStartX = minY >= 0 ? padLeft : zeroX;
                    let barX;
                    if (rawVal > 0) {
                      barX = baseStartX + runningPosW;
                      runningPosW += segW;
                      posSum += rawVal;
                    } else {
                      barX = baseStartX - runningNegW - segW;
                      runningNegW += segW;
                      negSum += rawVal;
                    }

                    barRects.push(
                      <rect
                        key={`h-rect-${rIdx}-${sName}`}
                        x={barX}
                        y={barY}
                        width={Math.max(segW, 0.5)}
                        height={Math.max(clusterH, 1)}
                        fill={color}
                        className="transition-all hover:opacity-85 cursor-pointer"
                        onClick={(e) => handleBarClick(e, row[catColIdx], sName, color)}
                        onMouseMove={(e) => handleHover(e, row, color, sName, rawVal)}
                        onMouseLeave={() => setHoveredData(null)}
                      />
                    );

                    if (config.showStackedSegmentLabels && segW > 28) {
                      barLabels.push(
                        <text
                          key={`h-seg-${rIdx}-${sName}`}
                          x={barX + segW / 2}
                          y={catCenterY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={segFontSize}
                          fill={getContrastColor(color)}
                          fontWeight="700"
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(rawVal, sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                        </text>
                      );
                    }
                  });

                  if (config.showStackedTotal !== false && runningPosW > 0) {
                    barLabels.push(
                      <text
                        key={`h-tot-pos-${rIdx}`}
                        x={zeroX + runningPosW + 8}
                        y={catCenterY}
                        textAnchor="start"
                        dominantBaseline="central"
                        fontSize={totalFontSize}
                        fill={valueLabelColor}
                        fontWeight={config.valueWeight}
                        style={{ pointerEvents: 'none' }}
                      >
                        {formatValue(posSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                      </text>
                    );
                  }
                  if (config.showStackedTotal !== false && runningNegW > 0) {
                    barLabels.push(
                      <text
                        key={`h-tot-neg-${rIdx}`}
                        x={zeroX - runningNegW - 8}
                        y={catCenterY}
                        textAnchor="end"
                        dominantBaseline="central"
                        fontSize={totalFontSize}
                        fill={valueLabelColor}
                        fontWeight={config.valueWeight}
                        style={{ pointerEvents: 'none' }}
                      >
                        {formatValue(negSum, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                      </text>
                    );
                  }
                } else {
                  const innerGapPx = K > 1 ? (clusterH * ((config.innerBarGapPct || 0) / 100)) / (K - 1) : 0;
                  const singleBarH = K > 1 ? (clusterH - (K - 1) * innerGapPx) / K : clusterH;
                  const clusterStartY = catCenterY - clusterH / 2;

                  seriesCols.forEach((colIdx, aIdx) => {
                    const sName = headers[colIdx];
                    const val = parseVal(row[colIdx], config.dataDecSep, config.dataThousandSep) / divisor;
                    const barY = clusterStartY + aIdx * (singleBarH + innerGapPx);
                    let barW, barX;
                    if (minY >= 0) {
                      barW = Math.max(0.5, ((val - minY) / (maxY - minY || 1)) * plotW);
                      barX = padLeft;
                    } else if (maxY <= 0) {
                      barW = Math.max(0.5, ((minY - val) / (maxY - minY || 1)) * plotW);
                      barX = padLeft + plotW - barW;
                    } else {
                      const absVal = Math.abs(val);
                      barW = Math.max(0.5, (absVal / (maxY - minY || 1)) * plotW);
                      barX = val >= 0 ? zeroX : (zeroX - barW);
                    }
                    const defaultColor = seriesColors[sName] || BRAND_SWATCHES[aIdx % BRAND_SWATCHES.length];
                    const color = getItemColor(row[catColIdx], sName, defaultColor, config.categoryColorOverrides);

                    barRects.push(
                      <rect
                        key={`h-rect-${rIdx}-${sName}`}
                        x={barX}
                        y={barY}
                        width={Math.max(barW, 0.5)}
                        height={Math.max(singleBarH, 1)}
                        fill={color}
                        className="transition-all hover:opacity-85 cursor-pointer"
                        onClick={(e) => handleBarClick(e, row[catColIdx], sName, color)}
                        onMouseMove={(e) => handleHover(e, row, color, sName, val)}
                        onMouseLeave={() => setHoveredData(null)}
                      />
                    );

                    if (val !== 0 && !isNaN(val) && shouldShowVal(rIdx, colIdx, val, row[catColIdx])) {
                      const valX = val >= 0 ? (barX + barW + 8) : (barX - 8);
                      const anchor = val >= 0 ? "start" : "end";
                      barLabels.push(
                        <text
                          key={`h-val-${rIdx}-${sName}`}
                          x={valX}
                          y={barY + singleBarH / 2}
                          textAnchor={anchor}
                          dominantBaseline="central"
                          fontSize={valFontSize}
                          fill={valueLabelColor}
                          fontWeight={config.valueWeight}
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatValue(val, sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                        </text>
                      );
                    }
                  });
                }

                if (config.drawXLabels !== false) {
                  const labelX = (config.axisPosition === "zero" && minY < 0)
                    ? (zeroX - 10)
                    : (hCatAlign === "left" ? 2 : padLeft - 10);
                  const textAnchor = (config.axisPosition === "zero" && minY < 0)
                    ? "end"
                    : (hCatAlign === "left" ? "start" : "end");

                  catLabels.push(
                    <text
                      key={`h-cat-${rIdx}`}
                      x={labelX}
                      y={catCenterY}
                      textAnchor={textAnchor}
                      dominantBaseline="central"
                      fontSize={catFontSize}
                      fill={xLabelColor}
                      fontWeight={config.categoryWeight || 400}
                    >
                      {getFormattedXLabel(row[catColIdx], rIdx)}
                    </text>
                  );
                }
              });

              return (
                <g>
                  <g className="bars-layer">{barRects}</g>
                  <g className="value-labels-layer">{barLabels}</g>
                  <g className="categories-layer">{catLabels}</g>
                  {minY < 0 && <line x1={zeroX} y1={padTop} x2={zeroX} y2={padTop + plotH} stroke={axisLineCol} strokeWidth={1.5} strokeDasharray={config.axisPosition === "bottom" ? "3 3" : undefined} />}
                  {config.drawXAxis && <line x1={axisX} y1={padTop} x2={axisX} y2={padTop + plotH} stroke={axisLineCol} strokeWidth={config.xAxisWidth || 2.5} />}
                </g>
              );
            })()}

            {/* 3. LINE & AREA CHART WITH STACKED AREA SUPPORT */}
            {config.chartType === "Line" && (() => {
              const N = Math.max(displayRows.length - 1, 1);
              const isStackedArea = config.fillLines && config.isStackedArea;
              const stackedTops = [];
              const stackedBottoms = [];
              const runningSums = new Array(displayRows.length).fill(0);

              seriesList.forEach((sName) => {
                const colIdx = headers.indexOf(sName);
                const tops = [];
                const bottoms = [];
                displayRows.forEach((r, i) => {
                  const rawVal = parseVal(r[colIdx >= 0 ? colIdx : 1], config.dataDecSep, config.dataThousandSep) / divisor;
                  const prevSum = runningSums[i];
                  const newSum = prevSum + Math.max(0, rawVal);
                  runningSums[i] = newSum;

                  const px = padLeft + (i / N) * plotW;
                  const pyTop = zeroY - (newSum / (maxY - minY || 1)) * plotH;
                  const pyBottom = zeroY - (prevSum / (maxY - minY || 1)) * plotH;
                  tops.push({ x: px, y: pyTop, val: rawVal });
                  bottoms.push({ x: px, y: pyBottom });
                });
                stackedTops.push(tops);
                stackedBottoms.push(bottoms);
              });

              return (
                <g>
                  {/* Area fills */}
                  {config.fillLines && seriesList.map((sName, sIdx) => {
                    const color = seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length];
                    const opacity = (config.fillOpacity !== undefined ? config.fillOpacity : 25) / 100;

                    if (isStackedArea) {
                      const tops = stackedTops[sIdx];
                      const bottoms = stackedBottoms[sIdx];
                      if (!tops || !tops.length) return null;

                      const topPath = tops.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(" ");
                      const bottomPath = bottoms.slice().reverse().map(p => `L ${p.x} ${p.y}`).join(" ");
                      const areaData = `${topPath} ${bottomPath} Z`;

                      return (
                        <path key={`stacked-area-${sName}`} d={areaData} fill={color} fillOpacity={opacity} stroke="none" />
                      );
                    } else {
                      const colIdx = headers.indexOf(sName);
                      const pts = displayRows.map((r, i) => {
                        const rawVal = parseVal(r[colIdx >= 0 ? colIdx : 1], config.dataDecSep, config.dataThousandSep) / divisor;
                        const px = padLeft + (i / N) * plotW;
                        const py = zeroY - (rawVal / (maxY - minY || 1)) * plotH;
                        return { x: px, y: py };
                      });
                      if (!pts.length) return null;
                      const areaData = `M ${pts[0].x} ${zeroY} ` + pts.map(p => `L ${p.x} ${p.y}`).join(" ") + ` L ${pts[pts.length - 1].x} ${zeroY} Z`;

                      return (
                        <path key={`area-${sName}-${sIdx}`} d={areaData} fill={color} fillOpacity={opacity} stroke="none" />
                      );
                    }
                  })}

                  {/* Lines and dots */}
                  {seriesList.map((sName, sIdx) => {
                    const color = seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length];
                    const pts = isStackedArea
                      ? stackedTops[sIdx]
                      : displayRows.map((r, i) => {
                          const colIdx = headers.indexOf(sName);
                          const rawVal = parseVal(r[colIdx >= 0 ? colIdx : 1], config.dataDecSep, config.dataThousandSep) / divisor;
                          const px = padLeft + (i / N) * plotW;
                          const py = zeroY - (rawVal / (maxY - minY || 1)) * plotH;
                          return { x: px, y: py, val: rawVal };
                        });

                    const pathData = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(" ");

                    return (
                      <g key={`${sName}-${sIdx}`}>
                        {config.strokeLines && (<path d={pathData} fill="none" stroke={color} strokeWidth={config.lineWidth || 3} strokeLinecap="round" strokeLinejoin="round" />)}
                        {config.drawDots && pts.map((pt, pIdx) => {
                          const catName = displayRows[pIdx]?.[catColIdx];
                          const dotColor = getItemColor(catName, sName, color, config.categoryColorOverrides);
                          return (
                            <circle
                              key={pIdx}
                              cx={pt.x}
                              cy={pt.y}
                              r={5}
                              fill={dotColor}
                              stroke="#ffffff"
                              strokeWidth="2"
                              className="cursor-pointer transition-all hover:r-6"
                              onClick={(e) => handleBarClick(e, catName, sName, dotColor)}
                              onMouseMove={(e) => {
                                e.stopPropagation();
                                handleHover(e, displayRows[pIdx], dotColor, sName, pt.val);
                              }}
                              onMouseLeave={() => setHoveredData(null)}
                            />
                          );
                        })}
                        {config.drawLineValues && pts.map((pt, pIdx) => {
                          const colIdx = headers.indexOf(sName);
                          if (!shouldShowVal(pIdx, colIdx, pt.val, displayRows[pIdx]?.[catColIdx])) return null;
                          const labelY = pt.val >= 0 ? (pt.y - 8) : (pt.y + 16);
                          return (
                            <text key={pIdx} x={pt.x} y={labelY} textAnchor="middle" fontSize={valFontSize} fill={valueLabelColor} fontWeight={config.valueWeight} style={{ pointerEvents: 'none' }}>
                              {formatValue(pt.val, sName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnLabels ? config.valuePrefix : "", config.unitOnLabels ? config.valueSuffix : "")}
                            </text>
                          );
                        })}
                      </g>
                    );
                  })}
                  {hoveredData && config.chartType === "Line" && (() => {
                    const hIdx = displayRows.indexOf(hoveredData.row);
                    if (hIdx >= 0) {
                      const hx = padLeft + (hIdx / N) * plotW;
                      return (
                        <line
                          x1={hx}
                          y1={padTop}
                          x2={hx}
                          y2={padTop + plotH}
                          stroke={isDark ? "#64748b" : "#94a3b8"}
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                          style={{ pointerEvents: 'none' }}
                        />
                      );
                    }
                    return null;
                  })()}
                  {displayRows.map((r, rIdx) => {
                    const px = padLeft + (rIdx / N) * plotW;
                    const sliceW = plotW / N;
                    return (
                      <rect
                        key={`line-slice-${rIdx}`}
                        x={px - sliceW / 2}
                        y={padTop}
                        width={sliceW}
                        height={plotH}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseMove={(e) => {
                          const firstSeries = seriesList[0] || "Serie 1";
                          const colIdx = headers.indexOf(firstSeries);
                          const v = parseVal(r[colIdx >= 0 ? colIdx : 1], config.dataDecSep, config.dataThousandSep);
                          const col = seriesColors[firstSeries] || BRAND_SWATCHES[0];
                          handleHover(e, r, col, firstSeries, v);
                        }}
                        onTouchStart={(e) => {
                          if (e.touches && e.touches[0]) {
                            const firstSeries = seriesList[0] || "Serie 1";
                            const colIdx = headers.indexOf(firstSeries);
                            const v = parseVal(r[colIdx >= 0 ? colIdx : 1], config.dataDecSep, config.dataThousandSep);
                            const col = seriesColors[firstSeries] || BRAND_SWATCHES[0];
                            handleHover({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }, r, col, firstSeries, v);
                          }
                        }}
                        onMouseLeave={() => setHoveredData(null)}
                      />
                    );
                  })}
                  {config.drawXLabels !== false && displayRows.map((r, rIdx) => {
                    if (!visibleXIndices.has(rIdx)) return null;
                    const px = padLeft + (rIdx / N) * plotW;
                    const anchor = (rIdx === 0) ? "start" : (rIdx === displayRows.length - 1) ? "end" : "middle";
                    return (
                      <text key={rIdx} x={px} y={padTop + plotH + 22} textAnchor={anchor} fontSize={catFontSize} fill={xLabelColor} fontWeight={config.categoryWeight || 400}>
                        {getFormattedXLabel(r[catColIdx], rIdx)}
                      </text>
                    );
                  })}
                  {minY < 0 && <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke={axisLineCol} strokeWidth={1.5} strokeDasharray={config.axisPosition === "bottom" ? "3 3" : undefined} />}
                  {config.drawXAxis && <line x1={padLeft} y1={axisY} x2={padLeft + plotW} y2={axisY} stroke={axisLineCol} strokeWidth={config.xAxisWidth || 2.5} />}
                </g>
              );
            })()}

            {/* 4. PIE / DONUT CHART */}
            {config.chartType === "Pie" && (() => {
              const isPieByRow = config.pieGrouping === "rows" || (config.pieGrouping !== "columns" && seriesList.length > 1 && displayRows.length > 1);
              let piesData = [];
              if (isPieByRow) {
                piesData = displayRows.map((row, rIdx) => {
                  const pieTitle = String(row[catColIdx] || `Rad ${rIdx + 1}`);
                  const slices = seriesList.map(sName => {
                    const colIdx = headers.indexOf(sName);
                    const rawCell = colIdx >= 0 ? row[colIdx] : "";
                    const val = isEmptyValue(rawCell) ? 0 : Math.max(0, (parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor));
                    return { name: sName, val, color: seriesColors[sName] || BRAND_SWATCHES[0] };
                  }).filter(sl => sl.val > 0);
                  const total = slices.reduce((sum, sl) => sum + sl.val, 0);
                  return { title: pieTitle, slices, total, origObj: row };
                });
              } else {
                piesData = seriesList.map((colName) => {
                  const colIdx = headers.indexOf(colName);
                  const slices = displayRows.map((row, rIdx) => {
                    const rawCell = colIdx >= 0 ? row[colIdx] : row[1];
                    const val = isEmptyValue(rawCell) ? 0 : Math.max(0, (parseVal(rawCell, config.dataDecSep, config.dataThousandSep) / divisor));
                    const catName = String(row[catColIdx] || `Kategori ${rIdx + 1}`);
                    return { name: catName, val, color: seriesColors[catName] || BRAND_SCALES[Math.min(Math.max(displayRows.length, 2), 10)][rIdx % 10] };
                  }).filter(sl => sl.val > 0);
                  const total = slices.reduce((sum, sl) => sum + sl.val, 0);
                  return { title: colName, slices, total, origObj: {} };
                });
              }

              const numPies = Math.max(1, piesData.length);
              const isMobile = !isPrint && width < 560;
              const pieCols = isMobile ? 1 : (numPies <= 4 ? numPies : (numPies <= 6 ? 3 : 4));
              const pieRowsCount = Math.ceil(numPies / pieCols);
              const slotW = plotW / pieCols;
              const slotH = plotH / pieRowsCount;
              const isSemi = config.isSemiCircle === true;
              const totalAngle = isSemi ? Math.PI : Math.PI * 2;
              const baseStartAngle = isSemi ? -Math.PI / 2 : 0;
              const maxTotal = Math.max(...piesData.map(p => p.total), 1);

              return (
                <g>
                  {piesData.map((pieItem, pIdx) => {
                    const { title: pieTitle, slices, total: curTotal, origObj } = pieItem;
                    const colInGrid = pIdx % pieCols;
                    const rowInGrid = Math.floor(pIdx / pieCols);
                    const centerX = padLeft + colInGrid * slotW + slotW / 2;
                    const centerY = isSemi ? padTop + rowInGrid * slotH + slotH * 0.82 : padTop + rowInGrid * slotH + (numPies > 1 ? slotH * 0.52 : slotH * 0.5);
                    const maxAllowedR = isSemi ? Math.min(slotW * 0.44, (slotH - (numPies > 1 ? 38 : 20)) * 0.90) : Math.min(slotW * 0.44, (slotH - (numPies > 1 ? 38 : 10)) * 0.44);
                    let radius = Math.max(maxAllowedR, 28);
                    if (config.pieProportionalSize && numPies > 1 && maxTotal > 0) {
                      const ratio = Math.sqrt(curTotal / maxTotal);
                      radius = Math.max(maxAllowedR * ratio, 20);
                    }
                    const innerRadius = config.isDonut ? radius * (config.holePct / 100) : 0;
                    let cumulativeAngle = baseStartAngle;

                    return (
                      <g key={pIdx}>
                        {numPies > 1 && (
                          <text x={centerX} y={isSemi ? centerY - radius - 14 : centerY - radius - 16} textAnchor="middle" fontSize={pieHeaderFontSize} fill={isDark ? "#f8fafc" : "#0f172a"} fontWeight="700">
                            {pieTitle}
                          </text>
                        )}
                        {slices.map(sliceItem => {
                          const { name: sliceName, val, color: sliceColor } = sliceItem;
                          const sliceFraction = curTotal > 0 ? (val / curTotal) : 0;
                          const sliceAngle = Math.min(sliceFraction * totalAngle, totalAngle - 0.0001);
                          const startAngle = cumulativeAngle;
                          const endAngle = cumulativeAngle + sliceAngle;
                          cumulativeAngle += sliceAngle;

                          const x1 = centerX + Math.sin(startAngle) * radius;
                          const y1 = centerY - Math.cos(startAngle) * radius;
                          const x2 = centerX + Math.sin(endAngle) * radius;
                          const y2 = centerY - Math.cos(endAngle) * radius;
                          const ix1 = centerX + Math.sin(startAngle) * innerRadius;
                          const iy1 = centerY - Math.cos(startAngle) * innerRadius;
                          const ix2 = centerX + Math.sin(endAngle) * innerRadius;
                          const iy2 = centerY - Math.cos(endAngle) * innerRadius;
                          const largeArc = !isSemi && sliceAngle > Math.PI ? 1 : 0;

                          const path = config.isDonut
                            ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
                            : `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                          const midAngle = startAngle + sliceAngle / 2;
                          const pctText = `${(sliceFraction * 100).toFixed(1)}%`;

                          return (
                            <g key={sliceName}>
                              <path d={path} fill={sliceColor} stroke={isDark ? "#0f172a" : "#ffffff"} strokeWidth="2" className={`transition-all hover:opacity-85 ${!isViewerMode && onElementClick ? 'cursor-pointer' : ''}`} onClick={(e) => { if (!isViewerMode && onElementClick) { e.stopPropagation(); onElementClick('color'); } }} onMouseMove={(e) => {
                                setHoveredData({ clientX: e.clientX, clientY: e.clientY, row: origObj, color: sliceColor, seriesName: numPies > 1 ? `${sliceName} (${pieTitle})` : sliceName, val });
                              }} onMouseLeave={() => setHoveredData(null)} />
                              {config.showPct && sliceAngle > (isSemi ? 0.22 : 0.40) && (() => {
                                const labelR = config.isDonut ? (radius + innerRadius) / 2 : radius * 0.65;
                                const lx = centerX + Math.sin(midAngle) * labelR;
                                const ly = centerY - Math.cos(midAngle) * labelR;
                                return (<text x={lx} y={ly + 4} textAnchor="middle" fontSize={pieSliceFontSize} fill={getContrastColor(sliceColor)} fontWeight="700">{pctText}</text>);
                              })()}
                            </g>
                          );
                        })}

                        {config.isDonut && (
                          <g style={{ pointerEvents: 'none' }}>
                            <text x={centerX} y={config.donutCenterSubtext ? centerY - 4 : centerY + 6} textAnchor="middle" fontSize={numPies > 2 ? 16 : 22} fill={isDark ? "#f8fafc" : "#0f172a"} fontWeight="700">
                              {config.donutCenterText || formatValue(curTotal, "", config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep)}
                            </text>
                            {config.donutCenterSubtext && (
                              <text x={centerX} y={centerY + 16} textAnchor="middle" fontSize={11} fill={isDark ? "#94a3b8" : "#64748b"} fontWeight="500">{config.donutCenterSubtext}</text>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })()}

            {/* 5. REFERENCE LINES */}
            {config.chartType !== "Pie" && (config.refLines || []).length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                {config.refLines.map(refItem => {
                  if (!refItem.val && refItem.val !== 0) return null;
                  const isXRef = refItem.axis === "X-Axis";
                  const strokeDash = refItem.style === "Dotted" ? "2 3" : (refItem.style === "Solid" ? "none" : "6 4");
                  const lineColor = refItem.color || "#64748b";
                  const lineOpacity = (refItem.opacity !== undefined ? refItem.opacity : 100) / 100;
                  const labelColor = isDark ? "#f8fafc" : (refItem.textColor || "#0f172a");
                  const lineThickness = refItem.width || 1.5;

                  if (isHorizontal) {
                    if (isXRef) {
                      const posInfo = computeXRefPosition(refItem, displayRows, catColIdx, plotW, plotH, padLeft, padTop, isHorizontal, config.chartType, parsedDates, config.datePart1, config.datePart2, config.datePart3, config.dataDecSep, config.dataThousandSep);
                      if (!posInfo) return null;
                      const ry = posInfo.posCoord;
                      return (
                        <g key={refItem.id}>
                          <line x1={padLeft} y1={ry} x2={padLeft + plotW} y2={ry} stroke={lineColor} strokeWidth={lineThickness} strokeDasharray={strokeDash} strokeOpacity={lineOpacity} />
                          {refItem.label && renderRefLineLabel(true, ry, refItem, padLeft, padTop, plotW, plotH, labelColor, refFontSize)}
                        </g>
                      );
                    } else {
                      const rVal = parseFloat(refItem.val) || 0;
                      const rx = padLeft + ((rVal - minY) / (maxY - minY || 1)) * plotW;
                      return (
                        <g key={refItem.id}>
                          <line x1={rx} y1={padTop} x2={rx} y2={padTop + plotH} stroke={lineColor} strokeWidth={lineThickness} strokeDasharray={strokeDash} strokeOpacity={lineOpacity} />
                          {refItem.label && renderRefLineLabel(false, rx, refItem, padLeft, padTop, plotW, plotH, labelColor, refFontSize)}
                        </g>
                      );
                    }
                  } else {
                    if (isXRef) {
                      const posInfo = computeXRefPosition(refItem, displayRows, catColIdx, plotW, plotH, padLeft, padTop, isHorizontal, config.chartType, parsedDates, config.datePart1, config.datePart2, config.datePart3, config.dataDecSep, config.dataThousandSep);
                      if (!posInfo) return null;
                      const rx = posInfo.posCoord;
                      return (
                        <g key={refItem.id}>
                          <line x1={rx} y1={padTop} x2={rx} y2={padTop + plotH} stroke={lineColor} strokeWidth={lineThickness} strokeDasharray={strokeDash} strokeOpacity={lineOpacity} />
                          {refItem.label && renderRefLineLabel(false, rx, refItem, padLeft, padTop, plotW, plotH, labelColor, refFontSize)}
                        </g>
                      );
                    } else {
                      const rVal = parseFloat(refItem.val) || 0;
                      const ry = zeroY - (rVal / (maxY - minY || 1)) * plotH;
                      return (
                        <g key={refItem.id}>
                          <line x1={padLeft} y1={ry} x2={padLeft + plotW} y2={ry} stroke={lineColor} strokeWidth={lineThickness} strokeDasharray={strokeDash} strokeOpacity={lineOpacity} />
                          {refItem.label && renderRefLineLabel(true, ry, refItem, padLeft, padTop, plotW, plotH, labelColor, refFontSize)}
                        </g>
                      );
                    }
                  }
                })}
              </g>
            )}
          </svg>

          {/* Interactive Tooltips */}
          {config.enableTooltip && hoveredData && (() => {
            const renderCustomTemplate = () => {
              let text = config.tooltipTemplate || "";
              headers.forEach((h, idx) => {
                const cellRaw = Array.isArray(hoveredData.row) ? hoveredData.row[idx] : "";
                let valFormatted = "";
                if (!isEmptyValue(cellRaw)) {
                  if (idx === catColIdx) {
                    valFormatted = getCategoryPopupDisplay(hoveredData.row);
                  } else {
                    const numVal = parseVal(cellRaw, config.dataDecSep, config.dataThousandSep) / divisor;
                    valFormatted = formatValue(numVal, h, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnTooltips ? config.valuePrefix : "", config.unitOnTooltips ? config.valueSuffix : "");
                  }
                }
                text = text.replaceAll(`{${h}}`, valFormatted);
              });
              text = text.replaceAll(`{category}`, getCategoryPopupDisplay(hoveredData.row));
              text = text.replaceAll(`{datum}`, getCategoryPopupDisplay(hoveredData.row));
              text = text.replaceAll(`{date}`, getCategoryPopupDisplay(hoveredData.row));
              text = text.replaceAll(`{series}`, hoveredData.seriesName || "");
              text = text.replaceAll(`{value}`, hoveredData.val == null ? "" : formatValue(hoveredData.val, hoveredData.seriesName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnTooltips ? config.valuePrefix : "", config.unitOnTooltips ? config.valueSuffix : ""));
              return text;
            };

            const selectedCols = (config.tooltipColumns && config.tooltipColumns.length > 0) ? config.tooltipColumns : (config.chartType === "Pie" ? pieCategories : seriesList);
            const visibleTooltipCols = selectedCols.filter(colName => {
              const colIdx = headers.indexOf(colName);
              if (colIdx < 0) return false;
              return Array.isArray(hoveredData.row) && !isEmptyValue(hoveredData.row[colIdx]);
            });

            const categoryTitle = getCategoryPopupDisplay(hoveredData.row) || hoveredData.catTitle || "";

            return (
              <div
                className="fixed z-50 pointer-events-none p-2.5 border text-xs shadow-none bg-white text-slate-900 border-slate-300"
                style={{ left: Math.min(hoveredData.clientX + 14, window.innerWidth - 240), top: Math.min(hoveredData.clientY + 14, window.innerHeight - 160), minWidth: '160px', borderRadius: 0 }}
              >
                {config.tooltipMode === "Custom Template" ? (
                  <div className="font-medium leading-snug whitespace-pre-wrap text-slate-800">{renderCustomTemplate()}</div>
                ) : (
                  <div>
                    {config.showPopupCategory !== false && categoryTitle && (
                      <div className="text-[12px] font-bold pb-1 mb-1 border-b flex items-center justify-between border-slate-200 text-slate-900">
                        <span className="font-medium text-slate-500">{headers[catColIdx] || headers[0] || "Kategori"}:</span>
                        <span>{categoryTitle}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      {config.chartType === "Pie" || visibleTooltipCols.length === 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center space-x-1.5 truncate">
                            {config.showPopupSwatch !== false && (<span className="w-2 h-2 inline-block shrink-0" style={{ backgroundColor: hoveredData.color }} />)}
                            <span className="truncate text-slate-600">{hoveredData.seriesName}:</span>
                          </div>
                          <span className="font-bold font-mono text-slate-900">{formatValue(hoveredData.val, hoveredData.seriesName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnTooltips ? config.valuePrefix : "", config.unitOnTooltips ? config.valueSuffix : "")}</span>
                        </div>
                      ) : (
                        visibleTooltipCols.map((colName) => {
                          const colIdx = headers.indexOf(colName);
                          const rawVal = Array.isArray(hoveredData.row) ? hoveredData.row[colIdx] : "";
                          const numVal = parseVal(rawVal, config.dataDecSep, config.dataThousandSep) / divisor;
                          const swatchColor = seriesColors[colName] || hoveredData.color;
                          return (
                            <div key={colName} className="flex items-center justify-between gap-3">
                              <div className="flex items-center space-x-1.5 truncate">
                                {config.showPopupSwatch !== false && (<span className="w-2 h-2 inline-block shrink-0" style={{ backgroundColor: swatchColor }} />)}
                                <span className="truncate text-slate-600">{colName}:</span>
                              </div>
                              <span className="font-bold font-mono text-slate-900">{formatValue(numVal, colName, config.valDecimals, config.thousandSep, config.decSep, config.dataDecSep, config.dataThousandSep, config.unitOnTooltips ? config.valuePrefix : "", config.unitOnTooltips ? config.valueSuffix : "")}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      );
    }
