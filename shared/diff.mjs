/**
 * LCS-based line diff for unified diff display.
 * @param {string[]} aLines
 * @param {string[]} bLines
 * @returns {Array<{type:"equal"|"add"|"remove",line:string}>}
 */
export function diff(aLines, bLines) {
  const m = aLines.length, n = bLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const edits = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      edits.push({ type: "equal", line: aLines[i++] });
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] > dp[i + 1][j])) {
      edits.push({ type: "add", line: bLines[j++] });
    } else {
      edits.push({ type: "remove", line: aLines[i++] });
    }
  }
  return edits;
}

/**
 * Collapse equal runs longer than 2*context+1 into {type:"ctx",count:N}.
 * @param {Array<{type:string,line?:string,count?:number}>} edits
 * @param {number} [context=3]
 * @returns {Array<{type:string,line?:string,count?:number}>}
 */
export function collapseContext(edits, context = 3) {
  const result = [];
  let i = 0;
  while (i < edits.length) {
    if (edits[i].type !== "equal") { result.push(edits[i++]); continue; }
    const start = i;
    while (i < edits.length && edits[i].type === "equal") i++;
    const run = edits.slice(start, i);
    if (run.length <= context * 2 + 1) {
      result.push(...run);
    } else {
      result.push(...run.slice(0, context));
      result.push({ type: "ctx", count: run.length - context * 2 });
      result.push(...run.slice(run.length - context));
    }
  }
  return result;
}
