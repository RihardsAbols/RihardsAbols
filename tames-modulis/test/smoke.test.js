import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

test('testu ietvars un exceljs atkarība ir pieejama', () => {
  assert.equal(typeof ExcelJS.Workbook, 'function');
});
