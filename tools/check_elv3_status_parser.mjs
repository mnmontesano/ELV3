#!/usr/bin/env node
// Run with: node tools/check_elv3_status_parser.mjs
// Synthetic fields only; uploaded inspection documents are not test fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    // ELV3 PDF Scanner Functions');
assert.ok(start >= 0, 'Scanner script must exist');
const scanner = html.slice(start, html.indexOf('    </script>', start));
const context = vm.createContext({
    console, Uint8Array, ArrayBuffer, URLSearchParams,
    window: { location: { search: '' } },
    document: { addEventListener() {} }
});
vm.runInContext(scanner, context);

function fixture() {
    return { formData: {}, fieldNames: [], fieldMeta: {} };
}
function field(data, name, value, page, x, y, fieldType = 'Tx') {
    data.fieldNames.push(name);
    data.fieldMeta[name] = { page, rect: [x - 5, y - 5, x + 5, y + 5], fieldType };
    if (value !== null) data.formData[name] = value;
}
function parse(data) {
    const result = {};
    context.parseELV3FormData(data.formData, result, data.fieldNames, data.fieldMeta);
    return JSON.parse(JSON.stringify(result));
}
const device = n => `1P${90000 + n}`;

function summaryFixture() {
    const data = fixture();
    // Includes the nonconsecutive continuation checkbox groups after device 10.
    const satNumbers = [65, 66, 67, 68, 69, 150, 151, 152, 153, 154, 209, 210];
    for (let n = 1; n <= 17; n++) {
        const page = n <= 5 ? 1 : 3;
        const y = n <= 5 ? 250 - (n - 1) * 14 : 508 - (n - 6) * 14;
        field(data, `Page${page}.Device ${n}`, device(n), page, 85, y);
        const sat = n <= 5 ? `CheckBox1_${68 + n}_[0]` : `CheckBox1[${satNumbers[n - 6]}]`;
        const unsat = n <= 5 ? `CheckBox1_${73 + n}_[0]` : `CheckBox1[${satNumbers[n - 6] + (n <= 15 ? 5 : 3)}]`;
        // Continuation field names retain Page1 even though widgets are on page 3.
        field(data, `topmostSubform[0].Page1[0].${sat}`, true, page, 460, y, 'Btn');
        field(data, `topmostSubform[0].Page1[0].${unsat}`, null, page, 478, y, 'Btn');
    }
    return data;
}

const allSat = parse(summaryFixture());
assert.equal(allSat.devices.length, 17);
assert.equal(allSat.satisfactoryDevices.length, 17);
assert.deepEqual(allSat.devicesWithoutStatusCheck, []);
assert.equal(allSat.violations.length, 0);

const mixed = summaryFixture();
delete mixed.formData['topmostSubform[0].Page1[0].CheckBox1[150]'];
mixed.formData['topmostSubform[0].Page1[0].CheckBox1[155]'] = true;
delete mixed.formData['topmostSubform[0].Page1[0].CheckBox1[151]'];
// An equipment-type checkbox in the same row must not supply inspection status.
field(mixed, 'topmostSubform[0].Page1[0].CheckBox1[122]', true, 3, 292, 424, 'Btn');
const mixedResult = parse(mixed);
assert.deepEqual(mixedResult.devicesWithoutStatusCheck, [device(12)]);
assert.deepEqual(mixedResult.devicesMissingViolationDetails.map(d => d.deviceNumber), [device(11)]);
assert.equal(mixedResult.satisfactoryDevices.length, 15);

// The detail-page fallback must recognize both supported device field names.
for (const rowName of ['Device 11', '_11_Device[0]']) {
    const data = fixture();
    field(data, `Page4.${rowName}`, device(11), 4, 260, 580);
    field(data, 'Page4.Check Box32', true, 4, 398, 565, 'Btn');
    assert.equal(parse(data).satisfactoryDevices.length, 1);
    delete data.formData['Page4.Check Box32'];
    assert.deepEqual(parse(data).devicesWithoutStatusCheck, [device(11)]);
    data.formData['Page4.Check Box32'] = true;
    data.fieldMeta['Page4.Check Box32'].page = 3;
    assert.deepEqual(parse(data).devicesWithoutStatusCheck, [device(11)]);
}

// Exercise the client pipeline too: unchecked column anchors must retain their
// metadata when PDF.js supplements pdf-lib's logical fields.
context.PDFLib = { PDFDocument: { load: async () => ({
    getPageCount: () => 4,
    getForm: () => ({ getFields: () => [] })
}) } };
context.pdfBufferLooksEncrypted = () => false;
context.areFieldNamesGarbled = () => false;
context.extractFormDataWithPdfJs = async () => summaryFixture();
context.extractELV3XfaDatasetFormData = () => fixture();
const clientResult = await context.parseELV3PDFClient(new ArrayBuffer(1));
assert.equal(clientResult.success, true);
assert.equal(clientResult.satisfactoryDevices.length, 17);
assert.equal(clientResult.devicesWithoutStatusCheck.length, 0);
console.log('ELV3 status regressions passed: continuation summaries, mixed/unchecked status, detail field variants, page isolation, and extraction metadata.');
