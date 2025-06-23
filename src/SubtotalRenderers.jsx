import React from 'react';
import PropTypes from 'prop-types';
import {PivotData, flatKey} from './Utilities';

// helper function for setting row/col-span in pivotTableRenderer
const spanSize = function(arr, i, j) {
  let x;
  if (i !== 0) {
    let asc, end;
    let noDraw = true;
    for (
      x = 0, end = j, asc = end >= 0;
      asc ? x <= end : x >= end;
      asc ? x++ : x--
    ) {
      if (arr[i - 1][x] !== arr[i][x]) {
        noDraw = false;
      }
    }
    if (noDraw) {
      return -1;
    }
  }
  let len = 0;
  while (i + len < arr.length) {
    let asc1, end1;
    let stop = false;
    for (
      x = 0, end1 = j, asc1 = end1 >= 0;
      asc1 ? x <= end1 : x >= end1;
      asc1 ? x++ : x--
    ) {
      if (arr[i][x] !== arr[i + len][x]) {
        stop = true;
      }
    }
    if (stop) {
      break;
    }
    len++;
  }
  return len;
};

function redColorScaleGenerator(values) {
  const min = Math.min.apply(Math, values);
  const max = Math.max.apply(Math, values);
  return x => {
    // eslint-disable-next-line no-magic-numbers
    const nonRed = 255 - Math.round(255 * (x - min) / (max - min));
    return {backgroundColor: `rgb(255,${nonRed},${nonRed})`};
  };
}

function makeRenderer(opts = {}) {
  class SubtotalRenderer extends React.Component {
    constructor(props) {
      super(props);

      // We need state to record which entries are collapsed and which aren't.
      // This is an object with flat-keys indicating if the corresponding rows
      // should be collapsed.
      this.state = {collapsedRows: {}, collapsedCols: {}};
      
      // Add custom CSS for subtotals if not already present
      if (opts.subtotals && !document.getElementById('react-pivottable-subtotal-styles')) {
        const style = document.createElement('style');
        style.id = 'react-pivottable-subtotal-styles';
        style.innerHTML = `
          .pvtSubtotal {
            font-weight: bold;
            background-color: #f0f0f0;
          }
          .pvtSubtotalRow {
            border-top: 1px solid #ddd;
          }
          .pvtSubtotalVal {
            color: #777;
            font-style: italic;
          }
        `;
        document.head.appendChild(style);
      }
    }

    getBasePivotSettings() {
      // One-time extraction of pivot settings that we'll use throughout the render.

      const props = this.props;
      const colAttrs = props.cols;
      const rowAttrs = props.rows;

      const tableOptions = Object.assign(
        {
          rowTotals: true,
          colTotals: true,
        },
        props.tableOptions
      );
      const rowTotals = tableOptions.rowTotals || colAttrs.length === 0;
      const colTotals = tableOptions.colTotals || rowAttrs.length === 0;

      const subtotalOptions = Object.assign(
        {
          arrowCollapsed: '\u25B6',
          arrowExpanded: '\u25E2',
        },
        props.subtotalOptions
      );

      const colSubtotalDisplay = Object.assign(
        {
          displayOnTop: false,
          enabled: rowTotals,
          hideOnExpand: false,
        },
        subtotalOptions.colSubtotalDisplay
      );

      const rowSubtotalDisplay = Object.assign(
        {
          displayOnTop: true,
          enabled: colTotals,
          hideOnExpand: false,
        },
        subtotalOptions.rowSubtotalDisplay
      );

      const pivotData = new PivotData(
        props,
        !opts.subtotals
          ? {}
          : {
              rowEnabled: rowSubtotalDisplay.enabled,
              colEnabled: colSubtotalDisplay.enabled,
              rowPartialOnTop: rowSubtotalDisplay.displayOnTop,
              colPartialOnTop: colSubtotalDisplay.displayOnTop,
            }
      );
      const rowKeys = pivotData.getRowKeys();
      const colKeys = pivotData.getColKeys();

      // Also pre-calculate all the callbacks for cells, etc... This is nice to have to
      // avoid re-calculations of the call-backs on cell expansions, etc...
      const cellCallbacks = {};
      const rowTotalCallbacks = {};
      const colTotalCallbacks = {};
      let grandTotalCallback = null;
      if (tableOptions.clickCallback) {
        rowKeys.forEach(rowKey => {
          const flatRowKey = flatKey(rowKey);
          cellCallbacks[flatRowKey] = {};
          colKeys.forEach(colKey => {
            const flatColKey = flatKey(colKey);
            if (!(flatRowKey in cellCallbacks)) {
              cellCallbacks[flatRowKey] = {};
            }
            cellCallbacks[flatRowKey][flatColKey] = this.clickHandler(
              pivotData,
              rowKey,
              colKey
            );
          });
          rowTotalCallbacks[flatRowKey] = this.clickHandler(
            pivotData,
            rowKey,
            []
          );
        });
        colKeys.forEach(colKey => {
          const flatColKey = flatKey(colKey);
          colTotalCallbacks[flatColKey] = this.clickHandler(
            pivotData,
            [],
            colKey
          );
        });
        grandTotalCallback = this.clickHandler(pivotData, [], []);
      }

      return Object.assign(
        {
          pivotData,
          colAttrs,
          rowAttrs,
          colKeys,
          rowKeys,
          rowTotals,
          colTotals,
          arrowCollapsed: subtotalOptions.arrowCollapsed,
          arrowExpanded: subtotalOptions.arrowExpanded,
          colSubtotalDisplay,
          rowSubtotalDisplay,
          cellCallbacks,
          rowTotalCallbacks,
          colTotalCallbacks,
          grandTotalCallback,
        },
        SubtotalRenderer.heatmapMappers(
          pivotData,
          props.tableColorScaleGenerator,
          colTotals,
          rowTotals
        )
      );
    }

    clickHandler(pivotData, rowValues, colValues) {
      const colAttrs = this.props.cols;
      const rowAttrs = this.props.rows;
      const value = pivotData.getAggregator(rowValues, colValues).value();
      const filters = {};
      const colLimit = Math.min(colAttrs.length, colValues.length);
      for (let i = 0; i < colLimit; i++) {
        const attr = colAttrs[i];
        if (colValues[i] != null) {
          filters[attr] = colValues[i];
        }
      }
      const rowLimit = Math.min(rowAttrs.length, rowValues.length);
      for (let i = 0; i < rowLimit; i++) {
        const attr = rowAttrs[i];
        if (rowValues[i] != null) {
          filters[attr] = rowValues[i];
        }
      }
      return e =>
        this.props.tableOptions.clickCallback(e, value, filters, pivotData);
    }

    collapseAttr(rowOrCol, attrIdx, allKeys){
      return () => {
        const flatCollapseKeys = {};
        for (const k of allKeys) {
          const slicedKey = k.slice(0, attrIdx + 1);
          flatCollapseKeys[flatKey(slicedKey)] = true;
        }
        if (rowOrCol === 'row') {
          this.setState({
            collapsedRows: Object.assign(
              {},
              this.state.collapsedRows,
              flatCollapseKeys
            ),
          });
        } else if (rowOrCol === 'col') {
          this.setState({
            collapsedCols: Object.assign(
              {},
              this.state.collapsedCols,
              flatCollapseKeys
            ),
          });
        }
      };
    }

    expandAttr(rowOrCol, attrIdx, allKeys) {
      return () => {
        const flatCollapseKeys = {};
        for (const k of allKeys) {
          const slicedKey = k.slice(0, attrIdx + 1);
          flatCollapseKeys[flatKey(slicedKey)] = false;
        }
        if (rowOrCol === 'row') {
          this.setState({
            collapsedRows: Object.assign(
              {},
              this.state.collapsedRows,
              flatCollapseKeys
            ),
          });
        } else if (rowOrCol === 'col') {
          this.setState({
            collapsedCols: Object.assign(
              {},
              this.state.collapsedCols,
              flatCollapseKeys
            ),
          });
        }
      };
    }

    toggleRowKey(flatRowKey) {
      return () => {
        this.setState({
          collapsedRows: Object.assign({}, this.state.collapsedRows, {
            [flatRowKey]: !this.state.collapsedRows[flatRowKey],
          }),
        });
      };
    }

    toggleColKey(flatColKey) {
      return () => {
        this.setState({
          collapsedCols: Object.assign({}, this.state.collapsedCols, {
            [flatColKey]: !this.state.collapsedCols[flatColKey],
          }),
        });
      };
    }

    calcAttrSpans(attrArr, numAttrs) {
      // Given an array of attribute values (i.e. each element is another array with
      // the value at every level), compute the spans for every attribute value at
      // each level.
      const spans = {};
      const keys = {};
      for (let i = 0; i < numAttrs; i++) {
        spans[i] = {};
        keys[i] = {};
      }
      const matched = {};
      for (let i = 0; i < attrArr.length; i++) {
        const arr = attrArr[i];
        const flatArr = [];
        for (let j = 0; j < arr.length; j++) {
          flatArr.push(flatKey(arr.slice(0, j + 1)));
        }
        for (let j = 0; j < arr.length; j++) {
          if (flatArr[j] in matched) {
            continue;
          }
          matched[flatArr[j]] = 1;
          if (j > 0) {
            if (arr[j - 1] === arr[j]) {
              spans[j][flatArr[j]] = 0;
              continue;
            }
          }
          let count = 1;
          while (i + count < attrArr.length) {
            if (j >= attrArr[i + count].length) {
              break;
            }
            if (
              flatKey(attrArr[i + count].slice(0, j + 1)) !== flatArr[j]
            ) {
              break;
            }
            count++;
          }
          spans[j][flatArr[j]] = count;
          keys[j][flatArr[j]] = arr[j];
        }
      }
      return {spans, keys};
    }

    static heatmapMappers(
      pivotData,
      colorScaleGenerator,
      colTotals,
      rowTotals
    ) {
      const colMapper = {};
      const rowMapper = {};
      
      if (colorScaleGenerator && opts.heatmapMode) {
        const valueCellColors = {};
        const rowTotalColors = {};
        const colTotalColors = {};
        let grandTotalColor = null;

        const allValues = [];
        const rowValues = {};
        const colValues = {};
        
        pivotData.forEachCell((val, rowKey, colKey) => {
          if (val !== null && val !== undefined && !isNaN(val)) {
            allValues.push(val);
            
            const flatRow = flatKey(rowKey);
            if (!rowValues[flatRow]) rowValues[flatRow] = [];
            rowValues[flatRow].push(val);
            
            const flatCol = flatKey(colKey);
            if (!colValues[flatCol]) colValues[flatCol] = [];
            colValues[flatCol].push(val);
          }
        });
        
        if (colTotals) {
          const rowTotalValues = [];
          pivotData.forEachTotal(([valKey, x]) => {
            const val = pivotData.getAggregator([valKey], []).value();
            if (val !== null && val !== undefined && !isNaN(val)) {
              rowTotalValues.push(val);
              if (opts.heatmapMode === 'full') allValues.push(val);
            }
          });
          
          const rowTotalColorScale = opts.heatmapMode === 'full' ? 
            colorScaleGenerator(allValues) : 
            colorScaleGenerator(rowTotalValues);
            
          pivotData.forEachTotal(([valKey, x], idx) => {
            const val = pivotData.getAggregator([valKey], []).value();
            if (val !== null && val !== undefined && !isNaN(val)) {
              rowTotalColors[flatKey([valKey])] = rowTotalColorScale(val);
            }
          });
        }

        if (rowTotals) {
          const colTotalValues = [];
          pivotData.forEachTotal(([x, valKey]) => {
            const val = pivotData.getAggregator([], [valKey]).value();
            if (val !== null && val !== undefined && !isNaN(val)) {
              colTotalValues.push(val);
              if (opts.heatmapMode === 'full') allValues.push(val);
            }
          });
          
          const colTotalColorScale = opts.heatmapMode === 'full' ?
            colorScaleGenerator(allValues) :
            colorScaleGenerator(colTotalValues);
            
          pivotData.forEachTotal(([x, valKey], idx) => {
            const val = pivotData.getAggregator([], [valKey]).value();
            if (val !== null && val !== undefined && !isNaN(val)) {
              colTotalColors[flatKey([valKey])] = colTotalColorScale(val);
            }
          });
        }
        
        if (colTotals && rowTotals) {
          const grandTotalVal = pivotData.getAggregator([], []).value();
          if (grandTotalVal !== null && grandTotalVal !== undefined && !isNaN(grandTotalVal)) {
            if (opts.heatmapMode === 'full') {
              allValues.push(grandTotalVal);
              const grandTotalColorScale = colorScaleGenerator(allValues);
              grandTotalColor = grandTotalColorScale(grandTotalVal);
            }
          }
        }

        if (rowTotals) {
          colMapper.totalColor = key => colTotalColors[flatKey([key])];
        }
        if (colTotals) {
          rowMapper.totalColor = key => rowTotalColors[flatKey([key])];
        }
        if (grandTotalColor) {
          colMapper.grandTotalColor = grandTotalColor;
        }

        if (opts.heatmapMode === 'full') {
          // Full heatmap: Compare values across the entire table
          // Note: allValues already contains all cell values from earlier collection
          const colorScale = colorScaleGenerator(allValues);
          
          pivotData.forEachCell((val, rowKey, colKey) => {
            if (val !== null && val !== undefined && !isNaN(val)) {
              valueCellColors[`${flatKey(rowKey)}_${flatKey(colKey)}`] = colorScale(val);
            }
          });
          
          colMapper.bgColorFromRowColKey = (rowKey, colKey) =>
            valueCellColors[`${flatKey(rowKey)}_${flatKey(colKey)}`];
        } 
        else if (opts.heatmapMode === 'row') {
          // Row heatmap: Compare values within each row
          // Note: rowValues already populated from earlier collection
          
          const rowColorScales = {};
          Object.entries(rowValues).forEach(([flatRow, values]) => {
            if (values.length > 0) {
              rowColorScales[flatRow] = colorScaleGenerator(values);
            }
          });
          
          pivotData.forEachCell((val, rowKey, colKey) => {
            const flatRow = flatKey(rowKey);
            if (val !== null && val !== undefined && !isNaN(val) && rowColorScales[flatRow]) {
              valueCellColors[`${flatRow}_${flatKey(colKey)}`] = rowColorScales[flatRow](val);
            }
          });
          
          colMapper.bgColorFromRowColKey = (rowKey, colKey) =>
            valueCellColors[`${flatKey(rowKey)}_${flatKey(colKey)}`];
        } 
        else if (opts.heatmapMode === 'col') {
          // Column heatmap: Compare values within each column
          // Note: colValues already populated from earlier collection
          
          const colColorScales = {};
          Object.entries(colValues).forEach(([flatCol, values]) => {
            if (values.length > 0) {
              colColorScales[flatCol] = colorScaleGenerator(values);
            }
          });
          
          pivotData.forEachCell((val, rowKey, colKey) => {
            const flatCol = flatKey(colKey);
            if (val !== null && val !== undefined && !isNaN(val) && colColorScales[flatCol]) {
              valueCellColors[`${flatKey(rowKey)}_${flatCol}`] = colColorScales[flatCol](val);
            }
          });
          
          colMapper.bgColorFromRowColKey = (rowKey, colKey) =>
            valueCellColors[`${flatKey(rowKey)}_${flatKey(colKey)}`];
        }
      }
      return {colMapper, rowMapper};
    }

    renderColHeaderRow(attrName, attrIdx, pivotSettings) {
      const {
        colKeys,
        colAttrs,
        rowAttrs,
        colSubtotalDisplay,
        arrowCollapsed,
        arrowExpanded,
      } = pivotSettings;
      const numAttrs = colAttrs.length;
      const attrSpan = colKeys.length;
      const totalHeadRowSpan = colAttrs.length + (rowAttrs.length ? 1 : 0);
      const visibleColKeys = this.visibleKeys(
        colKeys,
        this.state.collapsedCols,
        numAttrs,
        colSubtotalDisplay
      );

      const colSpans = this.calcAttrSpans(visibleColKeys, numAttrs);
      const cells = [];
      let colKeyIdx = 0;

      if (attrIdx === 0) {
        const rowspan = rowAttrs.length === 0 ? 1 : 2;
        if (rowAttrs.length !== 0) {
          cells.push(
            <th
              key="empty-0"
              colSpan={rowAttrs.length}
              rowSpan={colAttrs.length}
            />
          );
        }
        cells.push(
          <th className="pvtAxisLabel" key={`colAttr${attrIdx}`}>
            {attrName}
          </th>
        );
      }

      while (colKeyIdx < visibleColKeys.length) {
        const colKey = visibleColKeys[colKeyIdx];
        const flatColKey = flatKey(colKey.slice(0, attrIdx + 1));
        const colSpan = colSpans.spans[attrIdx][flatColKey];
        if (colSpan > 0) {
          let isCollapsed = false;
          let isHidden = false;
          if (attrIdx + 1 < colAttrs.length) {
            isCollapsed = this.state.collapsedCols[flatColKey];
            isHidden =
              attrIdx + 1 < colKey.length && colSubtotalDisplay.hideOnExpand;
          }
          const expandHandler =
            attrIdx + 1 === colAttrs.length
              ? null
              : this.expandAttr('col', attrIdx, colKeys);
          const collapseHandler =
            attrIdx + 1 === colAttrs.length
              ? null
              : this.collapseAttr('col', attrIdx, colKeys);
          const toggleHandler = this.toggleColKey(flatColKey);
          const attrValue = colSpans.keys[attrIdx][flatColKey];
          let className = 'pvtColLabel';
          let clickHandler = null;
          let icon = null;
          if (attrIdx + 1 < colAttrs.length) {
            if (isCollapsed) {
              clickHandler = expandHandler;
              className += ' collapsed';
              icon = arrowCollapsed;
            } else {
              clickHandler = collapseHandler;
              className += ' expanded';
              icon = arrowExpanded;
            }
          }
          if (isHidden) {
            cells.push(null);
          } else {
            cells.push(
              <th
                className={className}
                key={`colKey${attrIdx}-${colKeyIdx}`}
                colSpan={colSpan}
                rowSpan={
                  attrIdx === colAttrs.length - 1 && rowAttrs.length !== 0
                    ? 2
                    : 1
                }
                onClick={toggleHandler}
              >
                {icon && <span className="pvtAttr">{icon}</span>}
                <span className="pvtAttrLabel">{attrValue}</span>
              </th>
            );
          }
        }
        colKeyIdx += colSpan;
      }

      if (attrIdx !== 0) {
        cells.unshift(
          <th className="pvtAxisLabel" key={`colAttr${attrIdx}`}>
            {attrName}
          </th>
        );
      }

      if (pivotSettings.rowTotals && attrIdx === 0) {
        cells.push(
          <th
            className="pvtTotalLabel"
            key="total"
            rowSpan={totalHeadRowSpan}
          >
            Totals
          </th>
        );
      }

      return cells;
    }

    renderRowHeaderRow(pivotSettings) {
      const {colAttrs, rowAttrs} = pivotSettings;
      const cells = [];
      if (rowAttrs.length !== 0) {
        rowAttrs.map(function(r, i) {
          cells.push(
            <th className="pvtAxisLabel" key={`rowAttr${i}`}>
              {r}
            </th>
          );
        });
        cells.push(
          <th className="pvtTotalLabel" key="total">
            {colAttrs.length === 0 ? 'Totals' : null}
          </th>
        );
      }
      return cells;
    }

    renderTableRow(rowKey, rowIdx, pivotSettings) {
      const {
        colKeys,
        rowAttrs,
        colAttrs,
        rowTotals,
        pivotData,
        rowMapper,
        colMapper,
        cellCallbacks,
        rowTotalCallbacks,
      } = pivotSettings;
      
      const flatRowKey = flatKey(rowKey);
      const isCollapsed = this.state.collapsedRows[flatRowKey];
      
      const visibleColKeys = this.visibleKeys(
        colKeys,
        this.state.collapsedCols,
        colAttrs.length,
        pivotSettings.colSubtotalDisplay
      );

      const cells = [];

      // Determine if this is a parent row that can be collapsed
      const isParentWithChildren = rowKey.length < rowAttrs.length;
      const isCollapsedParent = isCollapsed && isParentWithChildren;
      const isSubtotalRow = isParentWithChildren && opts.subtotals;
      
      // For each visible column, render a cell
      visibleColKeys.forEach((colKey, i) => {
        try {
          if (!rowKey || !colKey) {
            console.warn('Invalid rowKey or colKey', rowKey, colKey);
            cells.push(
              <td
                className="pvtVal"
                key={`pvtVal-${i}`}
              >
                -
              </td>
            );
            return;
          }
          
          let aggregator, val, className, valCss = {};
          
          // Handle subtotal cells
          if (isSubtotalRow) {
            // For subtotal rows, we need to calculate the actual subtotal
            let value = this.calculateSubtotal(pivotData, rowKey, colKey, pivotSettings);
            className = "pvtSubtotal";
            
            // Create a temporary aggregator to format the value
            const tempAggregator = this.safeGetAggregator(pivotData, [], []);
            aggregator = {
              value: () => value,
              format: tempAggregator ? tempAggregator.format : (x => x)
            };
            
            if (opts.heatmapMode && rowMapper.totalColor) {
              const cellColor = rowMapper.totalColor(rowKey[0]);
              if (cellColor) {
                valCss = cellColor;
              }
            }
          } 
          // Handle column subtotal cells
          else if (colKey.length < colAttrs.length && this.state.collapsedCols[flatKey(colKey)]) {
            // For column subtotals, calculate the actual subtotal
            let value = this.calculateSubtotal(pivotData, rowKey, colKey, pivotSettings);
            className = "pvtSubtotal";
            
            // Create a temporary aggregator to format the value
            const tempAggregator = this.safeGetAggregator(pivotData, [], []);
            aggregator = {
              value: () => value,
              format: tempAggregator ? tempAggregator.format : (x => x)
            };
            
            if (opts.heatmapMode && colMapper.totalColor) {
              const cellColor = colMapper.totalColor(colKey[0]);
              if (cellColor) {
                valCss = cellColor;
              }
            }
          } 
          // Regular cells
          else {
            aggregator = this.safeGetAggregator(pivotData, rowKey, colKey);
            className = "pvtVal";
            
            if (opts.heatmapMode && colMapper.bgColorFromRowColKey) {
              const cellColor = colMapper.bgColorFromRowColKey(rowKey, colKey);
              if (cellColor) {
                valCss = cellColor;
              }
            }
          }
          
          // If no aggregator found, try to get a subtotal value if appropriate
          if (!aggregator || (aggregator.value() === null || aggregator.value() === undefined)) {
            // For empty values, try to get subtotal values if appropriate
            if (opts.subtotals && rowKey.length > 0) {
              // Try parent levels for a subtotal value
              for (let i = rowKey.length - 1; i >= 0; i--) {
                const subtotalKey = rowKey.slice(0, i);
                const subtotalAggregator = this.safeGetAggregator(pivotData, subtotalKey, colKey);
                if (subtotalAggregator && subtotalAggregator.value() !== null && subtotalAggregator.value() !== undefined) {
                  aggregator = subtotalAggregator;
                  className += " pvtSubtotalVal";
                  break;
                }
              }
            }
            
            // If still no valid aggregator
            if (!aggregator || (aggregator.value() === null || aggregator.value() === undefined)) {
              cells.push(
                <td
                  className={className}
                  key={`pvtVal-${i}`}
                  style={valCss}
                >
                  -
                </td>
              );
              return;
            }
          }
          
          val = aggregator.value();
          const isSubtotalValue = className.includes("pvtSubtotalVal");
          const formattedVal = (val === null || val === undefined || val === 0 || isSubtotalValue) ? '-' : aggregator.format(val);
          
          cells.push(
            <td
              className={className}
              key={`pvtVal-${i}`}
              style={valCss}
              onClick={cellCallbacks[flatRowKey] && flatKey(colKey) in cellCallbacks[flatRowKey] ? cellCallbacks[flatRowKey][flatKey(colKey)] : null}
            >
              {formattedVal}
            </td>
          );
        } catch (error) {
          console.error('Error rendering table cell:', error, {rowKey, colKey, i});
          cells.push(
            <td
              className="pvtVal"
              key={`pvtVal-${i}`}
            >
              -
            </td>
          );
        }
      });

      if (rowTotals) {
        try {
          const className = isSubtotalRow ? "pvtTotal pvtSubtotal" : "pvtTotal";
          let valCss = {};
          
          if (opts.heatmapMode && rowMapper.totalColor) {
            const cellColor = rowMapper.totalColor(rowKey[0]);
            if (cellColor) {
              valCss = cellColor;
            }
          }
          
          visibleColKeys.forEach(colKey => {
            try {
              const flatColKey = flatKey(colKey);
              const isColParent = colKey.length < colAttrs.length;
              const isColCollapsed = this.state.collapsedCols[flatColKey];
              
              if (!isColParent || isColCollapsed) {
                const colAggregator = pivotData.getAggregator(rowKey, colKey);
                if (colAggregator) {
                  const colVal = colAggregator.value();
                  if (colVal !== null && colVal !== undefined && !isNaN(colVal)) {
                    // We can accumulate values here if needed
                  }
                }
              }
            } catch (e) {
              console.warn('Error calculating column value for row total', rowKey, colKey, e);
            }
          });
          
          // Get the row total directly from the pivotData
          let totalVal = 0;
          let formattedTotal = '-';
          
          // For subtotal rows, calculate the actual sum
          if (isSubtotalRow) {
            totalVal = this.calculateSubtotal(pivotData, rowKey, [], pivotSettings);
          } else {
            // For regular rows, either get the aggregator or calculate
            const totalAggregator = this.safeGetAggregator(pivotData, rowKey, []);
            if (totalAggregator && totalAggregator.value() !== null && totalAggregator.value() !== undefined) {
              totalVal = totalAggregator.value();
            } else {
              // Calculate sum across all visible columns for this row
              visibleColKeys.forEach(colKey => {
                const flatColKey = flatKey(colKey);
                const isColParent = colKey.length < colAttrs.length;
                const isColCollapsed = this.state.collapsedCols[flatColKey];
                
                if (!isColParent || isColCollapsed) {
                  const agg = this.safeGetAggregator(pivotData, rowKey, colKey);
                  if (agg) {
                    const val = agg.value();
                    if (val !== null && val !== undefined && !isNaN(val)) {
                      totalVal += val;
                    }
                  }
                }
              });
            }
          }
          
          if (totalVal !== 0 || isSubtotalRow) {
            const tempAggregator = this.safeGetAggregator(pivotData, [], []);
            const formatFunc = tempAggregator && tempAggregator.format ? tempAggregator.format : (x => x);
            formattedTotal = totalVal === 0 ? '-' : formatFunc(totalVal);
          }
          
          cells.push(
            <td
              className={className}
              key="total"
              style={valCss}
              onClick={rowTotalCallbacks[flatRowKey]}
            >
              {formattedTotal}
            </td>
          );
        } catch (error) {
          console.error('Error rendering row total:', error, {rowKey});
          cells.push(
            <td
              className="pvtTotal"
              key="total"
            >
              -
            </td>
          );
        }
      }

      return cells;
    }

    renderTotalsRow(pivotSettings) {
      const {
        colKeys,
        colAttrs,
        rowAttrs,
        rowKeys,
        colTotals,
        pivotData,
        colMapper,
        grandTotalCallback,
        colTotalCallbacks,
      } = pivotSettings;
      
      const totalRowSpan = colAttrs.length + (rowAttrs.length === 0 ? 0 : 1);
      const visibleColKeys = this.visibleKeys(
        colKeys,
        this.state.collapsedCols,
        colAttrs.length,
        pivotSettings.colSubtotalDisplay
      );
      
      const visibleRowKeys = this.visibleKeys(
        rowKeys,
        this.state.collapsedRows,
        rowAttrs.length,
        pivotSettings.rowSubtotalDisplay
      );

      const cells = [];
      cells.push(
        <th
          key="labelTotal"
          className="pvtTotalLabel"
          colSpan={rowAttrs.length + (colAttrs.length === 0 ? 0 : 1)}
        >
          Totals
        </th>
      );

      visibleColKeys.forEach((colKey, i) => {
        try {
          if (!colKey) {
            console.warn('Invalid colKey in renderTotalsRow', colKey);
            cells.push(
              <td
                className="pvtTotal"
                key={`total-${i}`}
              >
                -
              </td>
            );
            return;
          }

          let colTotal = 0;
          const processedRows = new Set();
          
          if (colKey.length < colAttrs.length) {
            // For subtotal columns, calculate the actual subtotal
            colTotal = this.calculateSubtotal(pivotData, [], colKey, pivotSettings);
          } else {
            // For regular columns, sum the visible row values
            visibleRowKeys.forEach(rowKey => {
              const flatRowKey = flatKey(rowKey);
              
              if (processedRows.has(flatRowKey)) {
                return;
              }
              
              processedRows.add(flatRowKey);
              
              const isCollapsed = this.state.collapsedRows[flatRowKey];
              const isParent = rowKey.length < rowAttrs.length;
              
              try {
                let value = 0;
                
                if (isCollapsed && isParent) {
                  // If it's a collapsed parent, use the subtotal
                  value = this.calculateSubtotal(pivotData, rowKey, colKey, pivotSettings);
                } else if (rowKey.length === rowAttrs.length) {
                  // For leaf rows, get the direct value
                  const agg = this.safeGetAggregator(pivotData, rowKey, colKey);
                  if (agg) {
                    const val = agg.value();
                    if (val !== null && val !== undefined && !isNaN(val)) {
                      value = val;
                    }
                  }
                }
                
                if (value !== 0) {
                  colTotal += value;
                }
              } catch (e) {
                console.warn('Error calculating cell value', rowKey, colKey, e);
              }
            });
          }
          
          let valCss = {};
          if (opts.heatmapMode && colMapper.totalColor) {
            const cellColor = colMapper.totalColor(colKey[0]);
            if (cellColor) {
              valCss = cellColor;
            }
          }
          
          const tempAggregator = this.safeGetAggregator(pivotData, [], colKey);
          const format = tempAggregator && tempAggregator.format ? tempAggregator.format : (x => x);
          
          cells.push(
            <td
              className="pvtTotal"
              key={`total-${i}`}
              style={valCss}
              onClick={colTotalCallbacks[flatKey(colKey)]}
            >
              {colTotal === 0 ? '-' : (format ? format(colTotal) : colTotal)}
            </td>
          );
        } catch (error) {
          console.error('Error rendering column total:', error, {colKey, i});
          cells.push(
            <td
              className="pvtTotal"
              key={`total-${i}`}
            >
              -
            </td>
          );
        }
      });

      if (colTotals) {
        try {
          // For the grand total, we should always use the full dataset regardless of what's collapsed or expanded
          // This ensures the grand total is always consistent
          
          let grandTotal = 0;
          let validValuesFound = false;
          
          try {
            // Try to get the grand total directly from the pivotData
            const grandTotalAggregator = pivotData.getAggregator([], []);
            if (grandTotalAggregator) {
              const val = grandTotalAggregator.value();
              if (val !== null && val !== undefined && !isNaN(val)) {
                grandTotal = val;
                validValuesFound = true;
              }
            }
          } catch (e) {
            console.warn('Error getting grand total directly, will calculate manually', e);
          }
          
          // If we couldn't get the grand total directly, calculate it from all data
          if (!validValuesFound) {
            // Get all row keys (not just visible ones)
            const allRowKeys = pivotData.getRowKeys();
            const allColKeys = pivotData.getColKeys();
            
            // We'll only count leaf nodes to avoid double-counting
            const leafRowKeys = allRowKeys.filter(rowKey => rowKey.length === rowAttrs.length);
            const leafColKeys = allColKeys.filter(colKey => colKey.length === colAttrs.length);
            
            leafRowKeys.forEach(rowKey => {
              leafColKeys.forEach(colKey => {
                try {
                  const agg = this.safeGetAggregator(pivotData, rowKey, colKey);
                  if (agg) {
                    const val = agg.value();
                    if (val !== null && val !== undefined && !isNaN(val)) {
                      grandTotal += val;
                      validValuesFound = true;
                    }
                  }
                } catch (e) {
                  // Ignore errors for missing combinations
                }
              });
            });
          }
          
          const tempAggregator = this.safeGetAggregator(pivotData, [], []);
          const format = tempAggregator && tempAggregator.format ? tempAggregator.format : (x => x);
          
          cells.push(
            <td
              className="pvtGrandTotal"
              key="grandTotal"
              style={opts.heatmapMode && colMapper.grandTotalColor ? colMapper.grandTotalColor : {}}
              onClick={grandTotalCallback}
            >
              {validValuesFound ? (grandTotal === 0 ? '-' : (format ? format(grandTotal) : grandTotal)) : '-'}
            </td>
          );
        } catch (error) {
          console.error('Error rendering grand total:', error);
          cells.push(
            <td
              className="pvtGrandTotal"
              key="grandTotal"
            >
              -
            </td>
          );
        }
      }

      return cells;
    }

    visibleKeys(keys, collapsed, numAttrs, subtotalDisplay) {
      try {
        if (!keys || !Array.isArray(keys)) {
          console.error('Keys must be a valid array');
          return [];
        }
        
        if (!collapsed) {
          collapsed = {};
        }
        
        if (!subtotalDisplay) {
          subtotalDisplay = { hideOnExpand: false };
        }
        
        const result = [];
        const addedKeys = new Set();
        
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          
          // Process the key at each depth level
          for (let depth = 0; depth < key.length; depth++) {
            // Create a partial key up to this depth
            const partialKey = key.slice(0, depth + 1);
            const flatPartialKey = flatKey(partialKey);
            
            // Check if we need to add the subtotal entry for this level
            if (!addedKeys.has(flatPartialKey)) {
              // Add the partial key to our result set
              result.push(partialKey);
              addedKeys.add(flatPartialKey);
            }
            
            // If this partial key is collapsed, we don't process deeper levels
            if (collapsed[flatPartialKey]) {
              break;
            }
            
            // If we've reached the full key and it's not collapsed
            if (depth === key.length - 1) {
              // Add the full key if we haven't already
              const flatFullKey = flatKey(key);
              if (!addedKeys.has(flatFullKey)) {
                result.push(key);
                addedKeys.add(flatFullKey);
              }
            }
          }
        }
        
        return result;
      } catch (error) {
        console.error('Error in visibleKeys method:', error);
        return [];
      }
    }

    getSubtotal(rowKey, colKey, pivotSettings) {
      const { pivotData } = pivotSettings;
      return pivotData.getAggregator(rowKey, colKey).value();
    }

    // Helper method to determine if a row or column has subtotal values
    hasSubtotals(rowOrCol, key, pivotSettings) {
      const { rowAttrs, colAttrs } = pivotSettings;
      const attrs = rowOrCol === 'row' ? rowAttrs : colAttrs;
      
      // If key length is less than total attributes, it can have subtotals
      return key.length < attrs.length;
    }

    // Safely get aggregator, returning null if there's an error
    safeGetAggregator(pivotData, rowKey, colKey) {
      try {
        return pivotData.getAggregator(rowKey, colKey);
      } catch (error) {
        // This happens when specific day combinations don't exist in the data
        return null;
      }
    }
    
    // Calculate the subtotal for a specific row/column combination
    calculateSubtotal(pivotData, rowKey, colKey, pivotSettings) {
      const { rowAttrs, colAttrs } = pivotSettings;
      
      // If this is already a leaf node, just return its value
      if (rowKey.length === rowAttrs.length && colKey.length === colAttrs.length) {
        const agg = this.safeGetAggregator(pivotData, rowKey, colKey);
        return agg ? agg.value() : 0;
      }
      
      // For subtotals, we need to sum all child values
      let total = 0;
      
      // Get all possible child row keys for this rowKey
      const childRowKeys = [];
      if (rowKey.length < rowAttrs.length) {
        pivotData.getRowKeys().forEach(fullRowKey => {
          // Check if this is a child of the current rowKey
          let isChild = true;
          for (let i = 0; i < rowKey.length; i++) {
            if (fullRowKey[i] !== rowKey[i]) {
              isChild = false;
              break;
            }
          }
          
          if (isChild && fullRowKey.length > rowKey.length) {
            childRowKeys.push(fullRowKey);
          }
        });
      } else {
        // If we're at a leaf row, just use this row
        childRowKeys.push(rowKey);
      }
      
      // Get all possible child column keys for this colKey
      const childColKeys = [];
      if (colKey.length < colAttrs.length) {
        pivotData.getColKeys().forEach(fullColKey => {
          // Check if this is a child of the current colKey
          let isChild = true;
          for (let i = 0; i < colKey.length; i++) {
            if (fullColKey[i] !== colKey[i]) {
              isChild = false;
              break;
            }
          }
          
          if (isChild && fullColKey.length > colKey.length) {
            childColKeys.push(fullColKey);
          }
        });
      } else {
        // If we're at a leaf column, just use this column
        childColKeys.push(colKey);
      }
      
      // If we have no children, try to get the direct value
      if (childRowKeys.length === 0 || childColKeys.length === 0) {
        const agg = this.safeGetAggregator(pivotData, rowKey, colKey);
        return agg ? agg.value() : 0;
      }
      
      // Sum up all child values
      childRowKeys.forEach(childRowKey => {
        childColKeys.forEach(childColKey => {
          const agg = this.safeGetAggregator(pivotData, childRowKey, childColKey);
          if (agg) {
            const val = agg.value();
            if (val !== null && val !== undefined && !isNaN(val)) {
              total += val;
            }
          }
        });
      });
      
      return total;
    }

    render() {
      const pivotSettings = this.getBasePivotSettings();
      const {
        colAttrs,
        rowAttrs,
        rowKeys,
        colKeys,
        rowTotals,
        colTotals,
      } = pivotSettings;

      const renderedLabels = {};
      
      const visibleRowKeys = this.visibleKeys(
        rowKeys,
        this.state.collapsedRows,
        rowAttrs.length,
        pivotSettings.rowSubtotalDisplay
      );

      const rowspans = {};
      visibleRowKeys.forEach((rowKey, rowIdx) => {
        for (let level = 0; level < rowKey.length; level++) {
          const cellKey = `${rowIdx}-${level}`;
          const value = rowKey[level];
          
          let span = 1;
          let j = rowIdx + 1;
          while (j < visibleRowKeys.length) {
            const nextKey = visibleRowKeys[j];
            if (level >= nextKey.length) break;
            
            let matches = true;
            for (let l = 0; l <= level; l++) {
              if (l >= nextKey.length || nextKey[l] !== rowKey[l]) {
                matches = false;
                break;
              }
            }
            
            if (!matches) break;
            span++;
            j++;
          }
          
          rowspans[cellKey] = span;
        }
      });

      const renderedRows = visibleRowKeys.map((rowKey, i) => {
        const rowCells = [];
        
        // Check if this is a subtotal row (parent row with children)
        const isSubtotalRow = rowKey.length < rowAttrs.length && opts.subtotals;
        
        for (let level = 0; level < rowKey.length; level++) {
          const labelKey = `${rowKey.slice(0, level+1).join('|')}`;
          
          if (!renderedLabels[labelKey]) {
            renderedLabels[labelKey] = true;
            
            const cellKey = `${i}-${level}`;
            const rowspan = rowspans[cellKey] || 1;
            
            const flatRowKey = flatKey(rowKey.slice(0, level+1));
            const isCollapsed = this.state.collapsedRows[flatRowKey];
            
            let className = 'pvtRowLabel';
            if (isSubtotalRow) {
              className += ' pvtSubtotal';
            }
            
            let icon = null;
            
            if (level + 1 < rowAttrs.length) {
              if (isCollapsed) {
                className += ' collapsed';
                icon = pivotSettings.arrowCollapsed;
              } else {
                className += ' expanded';
                icon = pivotSettings.arrowExpanded;
              }
            }
            
            rowCells.push(
              <th
                key={`rowLabel-${level}`}
                className={className}
                rowSpan={rowspan}
                onClick={this.toggleRowKey(flatRowKey)}
              >
                {icon && <span className="pvtAttr">{icon}</span>}
                <span>{rowKey[level]}</span>
              </th>
            );
          }
        }
        
        if (rowKey.length < rowAttrs.length) {
          rowCells.push(
            <th
              key="padding"
              className={`pvtRowLabel ${opts.subtotals ? 'pvtSubtotal' : ''}`}
              colSpan={rowAttrs.length - rowKey.length}
            />
          );
        }
        
        rowCells.push(
          <th key="separator" className={`pvtTotalLabel ${isSubtotalRow && opts.subtotals ? 'pvtSubtotal' : ''}`} />
        );
        
        const dataCells = this.renderTableRow(rowKey, i, pivotSettings);
        
        return (
          <tr key={`row-${i}`} className={isSubtotalRow && opts.subtotals ? 'pvtSubtotalRow' : ''}>
            {rowCells}
            {dataCells}
          </tr>
        );
      });

      const colAttrsHeaders = colAttrs.map((attrName, i) => {
        return (
          <tr key={`colAttr-${i}`}>
            {this.renderColHeaderRow(attrName, i, pivotSettings)}
          </tr>
        );
      });

      let rowAttrsHeader = null;
      if (rowAttrs.length > 0) {
        rowAttrsHeader = (
          <tr key="rowAttr-0">{this.renderRowHeaderRow(pivotSettings)}</tr>
        );
      }

      let totalHeader = null;
      if (rowTotals) {
        totalHeader = (
          <tr key="total">{this.renderTotalsRow(pivotSettings)}</tr>
        );
      }

      return (
        <table className="pvtTable">
          <thead>
            {colAttrsHeaders}
            {rowAttrsHeader}
          </thead>
          <tbody>
            {renderedRows}
            {totalHeader}
          </tbody>
        </table>
      );
    }
  }

  SubtotalRenderer.defaultProps = PivotData.defaultProps;
  SubtotalRenderer.propTypes = PivotData.propTypes;
  SubtotalRenderer.defaultProps.tableColorScaleGenerator = redColorScaleGenerator;
  SubtotalRenderer.defaultProps.tableOptions = {};
  SubtotalRenderer.propTypes.tableColorScaleGenerator = PropTypes.func;
  SubtotalRenderer.propTypes.tableOptions = PropTypes.object;
  return SubtotalRenderer;
}

class TSVExportRenderer extends React.PureComponent {
  render() {
    const pivotData = new PivotData(this.props);
    const rowKeys = pivotData.getRowKeys();
    const colKeys = pivotData.getColKeys();
    if (rowKeys.length === 0) {
      rowKeys.push([]);
    }
    if (colKeys.length === 0) {
      colKeys.push([]);
    }

    const headerRow = pivotData.props.rows.map(r => r);
    if (colKeys.length === 1 && colKeys[0].length === 0) {
      headerRow.push(this.props.aggregatorName);
    } else {
      colKeys.map(c => headerRow.push(c.join('-')));
    }

    const result = rowKeys.map(r => {
      const row = r.map(x => x);
      colKeys.map(c => {
        const aggregator = pivotData.getAggregator(r, c);
        row.push(aggregator.value());
      });
      return row;
    });

    result.unshift(headerRow);

    return (
      <textarea
        value={result.map(r => r.join('\t')).join('\n')}
        style={{width: window.innerWidth / 2, height: window.innerHeight / 2}}
        readOnly={true}
      />
    );
  }
}

TSVExportRenderer.defaultProps = PivotData.defaultProps;
TSVExportRenderer.propTypes = PivotData.propTypes;

export default {
  'Table With Subtotal': makeRenderer({subtotals: true}),
  'Heatmap With Subtotal': makeRenderer({
    heatmapMode: 'full',
    subtotals: true,
  }),
  'Col Heatmap With Subtotal': makeRenderer({
    heatmapMode: 'col',
    subtotals: true,
  }),
  'Row Heatmap With Subtotal': makeRenderer({
    heatmapMode: 'row',
    subtotals: true,
  }),
  'Exportable TSV': TSVExportRenderer,
};
