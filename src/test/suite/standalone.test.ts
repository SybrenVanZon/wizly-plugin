
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// Dynamic workspace root for per-test template overrides
let currentTestFolder: string | null = null;

// Mock vscode module before importing modules that depend on it
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(request: string) {
    if (request === 'vscode') {
        return {
            workspace: {
                get workspaceFolders() {
                    return currentTestFolder
                        ? [{ uri: { fsPath: currentTestFolder } }]
                        : [];
                },
                getConfiguration: () => ({
                    get: (key: string) => {
                        if (key === 'transformTag.enable') { return false; }
                        return undefined;
                    }
                })
            },
            window: {
                showErrorMessage: (msg: string) => console.error(msg),
                showWarningMessage: (msg: string) => console.warn(msg),
                showInformationMessage: (msg: string) => console.log(msg)
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Now import the modules to test
import * as utils from '../../utils';
import * as transformer from '../../transformer';
import { sanitizeRules } from '../../config';
import { parseMagicColorFile, parseMagicColorValue, renderMagicColorUtilitiesScss, renderMagicColorVarsScss } from '../../magic-colors';

// Parse regex strings like '/pattern/flags' into RegExp objects, recursively
function parseRegexFields(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(parseRegexFields);
    }
    if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = parseRegexFields(v);
        }
        return result;
    }
    if (typeof obj === 'string') {
        const m = obj.match(/^\/(.+)\/([gimsuy]*)$/);
        if (m) {
            return new RegExp(m[1], m[2]);
        }
    }
    return obj;
}

// Merge partial settings over defaults (arrays replace, objects shallow-merge)
function mergeSettings(defaults: any, partial: any): any {
    const result = { ...defaults };
    for (const [k, v] of Object.entries(partial)) {
        if (Array.isArray(v) || typeof v !== 'object' || v === null) {
            result[k] = v;
        } else if (typeof result[k] === 'object' && result[k] !== null && !Array.isArray(result[k])) {
            result[k] = { ...result[k], ...v };
        } else {
            result[k] = v;
        }
    }
    return result;
}

suite('Wizly Utils Test Suite', () => {
	test('Magic colors: parses RGB and system colors from the color file', () => {
		const parsed = parseMagicColorFile([
			"Window's Default,FFFFFFF7,FFFFFFFA,6,0",
			'white_green,00FFFFFF,0000FF00,0,0',
			'PurpleTransparent,00FF0080,00FFFFFF,1,0'
		].join('\n'));

		assert.strictEqual(parsed.length, 3);
		assert.strictEqual(parsed[0].foreground.kind, 'system');
		assert.strictEqual(parsed[0].foreground.systemName, 'WindowText');
		assert.strictEqual(parsed[0].foreground.scssValue, 'CanvasText');
		assert.strictEqual(parsed[0].background.kind, 'system');
		assert.strictEqual(parsed[0].background.scssValue, 'Canvas');

		assert.strictEqual(parsed[1].foreground.kind, 'rgb');
		assert.strictEqual(parsed[1].foreground.scssValue, '#ffffff');
		assert.strictEqual(parsed[1].background.scssValue, '#00ff00');

		assert.strictEqual(parsed[2].transparentBackground, true);
		assert.strictEqual(parsed[2].foreground.scssValue, '#ff0080');
	});

	test('Magic colors: falls back for non-hex values and unknown system colors', () => {
		const transparent = parseMagicColorValue('not-a-color');
		assert.strictEqual(transparent.scssValue, 'transparent');

		const unknownSystem = parseMagicColorValue('FFFFFF00');
		assert.strictEqual(unknownSystem.kind, 'system');
		assert.strictEqual(unknownSystem.scssValue, 'Canvas');
		assert.strictEqual(unknownSystem.systemIndex, 255);
	});

	test('Magic colors: renders vars and utility classes with transparent background handling', () => {
		const parsed = parseMagicColorFile([
			'ButtonTextRed,00C8C8C8,00C08000,0,0',
			'PurpleTransparent,00FF0080,00FFFFFF,1,0'
		].join('\n'));

		const varsScss = renderMagicColorVarsScss(parsed);
		const utilitiesScss = renderMagicColorUtilitiesScss(parsed);

		assert.ok(varsScss.includes('$magic-color-1-foreground: #c8c8c8;'));
		assert.ok(varsScss.includes('$magic-color-2-background: transparent;'));
		assert.ok(varsScss.includes('// Background 00FFFFFF skipped because flag1 indicates transparency.'));

		assert.ok(utilitiesScss.includes('.magic-color-1 {'));
		assert.ok(utilitiesScss.includes('background-color: magic.$magic-color-1-background;'));
		assert.ok(utilitiesScss.includes('.magic-color-2 {'));
		assert.ok(utilitiesScss.includes('color: magic.$magic-color-2-foreground;'));
		assert.ok(!utilitiesScss.includes('background-color: magic.$magic-color-2-background;'));
	});

	test('resolveControlName: Standard prefix', () => {
		const settings = {
			transformTag: { enable: false, dateFormat: '', timeFormat: '' },
			smartLabelMatcher: { enabled: true, labelPrefix: 'lbl_', controlPrefix: 'vt_' }
		};

		assert.strictEqual(utils.resolveControlName('mgc.lbl_Test', settings as any), 'Test');
		assert.strictEqual(utils.resolveControlName('mgc.vt_Control', settings as any), 'Control');
		assert.strictEqual(utils.resolveControlName('lbl_Test', settings as any), 'Test');
	});

	test('resolveControlName: Multiple label prefixes', () => {
		const settings = {
			transformTag: { enable: false, dateFormat: '', timeFormat: '' },
			smartLabelMatcher: { enabled: true, labelPrefix: ['lbl_', 'L_'], controlPrefix: ['vt_', 'V_'] }
		};

		assert.strictEqual(utils.resolveControlName('mgc.L_Test', settings as any), 'Test');
		assert.strictEqual(utils.resolveControlName('mgc.lbl_Other', settings as any), 'Other');
		assert.strictEqual(utils.resolveControlName('mgc.V_Control', settings as any), 'Control');
	});

	test('resolveControlName: No match returns null', () => {
		const settings = {
			transformTag: { enable: false, dateFormat: '', timeFormat: '' },
			smartLabelMatcher: { enabled: true, labelPrefix: 'lbl_', controlPrefix: 'vt_' }
		};

		assert.strictEqual(utils.resolveControlName('random_string', settings as any), null);
	});

	test('isHtmlFile', () => {
		assert.strictEqual(utils.isHtmlFile('test.html'), true);
		assert.strictEqual(utils.isHtmlFile('test.htm'), true);
		assert.strictEqual(utils.isHtmlFile('test.js'), false);
	});
});

suite('Wizly Integration Tests', function() {
    test('Environment Check', () => {
        assert.ok(true);
    });

    const fixturesDir = path.resolve(__dirname, '../../../src/test/fixtures');
    const inputDir = path.join(fixturesDir, 'input');
    const expectedDir = path.join(fixturesDir, 'expected');

    const defaultRulesPath = path.resolve(__dirname, '../../../default.rules.js');
    let rules: any[] = [];
    if (fs.existsSync(defaultRulesPath)) {
        const rulesModule = require(defaultRulesPath);
        const rawRules = rulesModule.rules || (rulesModule.default && rulesModule.default.rules) || rulesModule;
        if (Array.isArray(rawRules)) {
            rules = sanitizeRules(rawRules);
        }
    }

    function makeDefaultSettings(): any {
        return {
            transformTag: { enable: false, dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm', template: '' },
            smartLabelMatcher: { enabled: true, labelPrefix: 'L_', controlPrefix: ['V_', 'P_'] }
        };
    }

    // Flat-file tests (no custom settings)
    if (fs.existsSync(inputDir)) {
        const flatFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.html'));
        flatFiles.forEach(file => {
            test(`Transform: ${file}`, async () => {
                const inputPath = path.join(inputDir, file);
                const expectedPath = path.join(expectedDir, file);
                if (!fs.existsSync(expectedPath)) { return; }

                const inputContent = fs.readFileSync(inputPath, 'utf8');
                const expectedContent = fs.readFileSync(expectedPath, 'utf8');
                const settings = makeDefaultSettings();
                const modes = [{ name: 'Test', active: true, rules }];
                const result = await transformer.transformText(inputContent, file, { modes, settings });

                assert.strictEqual(result.replace(/\r\n/g, '\n').trim(), expectedContent.replace(/\r\n/g, '\n').trim());
            });
        });
    }

    // Folder-based tests (with settings.js and/or template overrides)
    if (fs.existsSync(inputDir)) {
        const entries = fs.readdirSync(inputDir, { withFileTypes: true });
        const testFolders = entries.filter(e => e.isDirectory()).map(e => e.name);
        testFolders.forEach(folderName => {
            const folderPath = path.join(inputDir, folderName);
            const rawPath = path.join(folderPath, 'raw.html');
            if (!fs.existsSync(rawPath)) { return; }

            test(`Transform: ${folderName}/raw.html`, async () => {
                const expectedPath = path.join(expectedDir, `${folderName}.html`);
                if (!fs.existsSync(expectedPath)) { return; }

                const inputContent = fs.readFileSync(rawPath, 'utf8');
                const expectedContent = fs.readFileSync(expectedPath, 'utf8');

                let settings = makeDefaultSettings();
                const settingsPath = path.join(folderPath, 'settings.js');
                if (fs.existsSync(settingsPath)) {
                    // Clear require cache so settings are re-read fresh
                    delete require.cache[require.resolve(settingsPath)];
                    const partial = parseRegexFields(require(settingsPath));
                    settings = mergeSettings(settings, partial);
                }

                const hasTemplateOverrides = fs.existsSync(path.join(folderPath, '.vswizly', 'templates'));
                if (hasTemplateOverrides) {
                    currentTestFolder = folderPath;
                }
                try {
                    const modes = [{ name: 'Test', active: true, rules }];
                    const result = await transformer.transformText(inputContent, 'raw.html', { modes, settings });
                    assert.strictEqual(result.replace(/\r\n/g, '\n').trim(), expectedContent.replace(/\r\n/g, '\n').trim());
                } finally {
                    currentTestFolder = null;
                }
            });
        });
    }
});
