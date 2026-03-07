
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// Mock vscode module before importing modules that depend on it
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(request: string) {
    if (request === 'vscode') {
        return {
            workspace: {
                workspaceFolders: [],
                getConfiguration: () => ({
                    get: (key: string) => {
                        if (key === 'transformTag.enable'){ return false; };
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

suite('Wizly Utils Test Suite', () => {
	test('resolveControlName: Standard prefix', () => {
		const settings = {
			transformTag: { enable: false, dateFormat: '', timeFormat: '' },
			smartLabelMatcher: { enabled: true, labelPrefix: 'lbl_', controlPrefix: 'vt_' }
		};
		
		assert.strictEqual(utils.resolveControlName('mgc.lbl_Test', settings as any), 'Test');
		assert.strictEqual(utils.resolveControlName('mgc.vt_Control', settings as any), 'Control');
		assert.strictEqual(utils.resolveControlName('lbl_Test', settings as any), 'Test');
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

// Define a type for our test rules to match transformer expectations
interface TestRule {
    name: string;
    description: string;
    regex: string;
    flags?: string;
    replacement?: string;
    templateFile?: string;
    active: boolean;
    filePattern: string;
}

// NOTE: We must declare tests synchronously in Mocha for them to be picked up.
// If we use async file reading, we must ensure tests are generated.
// fs.readdirSync is synchronous so it should be fine.
// The issue might be where the suite is defined or if it's being skipped.

suite('Wizly Integration Tests', function() {
    // Manually define tests to ensure they are registered
    test('Environment Check', () => {
        console.log('Environment Check Test Running');
        assert.ok(true);
    });

    // Use __dirname to find fixtures relative to the test file
    // We want to read from SRC, not OUT, to ensure we get the latest edited HTML files
    // __dirname is .../out/test/suite
    // Target is .../src/test/fixtures (3 levels up to root)
    const fixturesDir = path.resolve(__dirname, '../../../src/test/fixtures');
    // console.log('Resolving fixtures from:', fixturesDir);
    
    const inputDir = path.join(fixturesDir, 'input');
    const expectedDir = path.join(fixturesDir, 'expected');
    
    // Use synchronous check and test definition
    const inputFiles = fs.existsSync(inputDir) ? fs.readdirSync(inputDir).filter(f => f.endsWith('.html')) : [];
    
    if (inputFiles.length > 0) {
        // Prepare templates ONCE before running tests
        const templatesRoot = path.resolve(__dirname, '../../../templates');
        const outTemplatesDir = path.resolve(__dirname, '../../../templates'); // Adjusted to point to out/templates
        // Note: out/templates is at the same level as out/test/.. so ../../../templates from suite lands in out/templates?
        // __dirname: out/test/suite
        // ../../../templates -> out/templates? No.
        // out/test/suite -> out/test -> out -> templates.
        // So ../../../templates is correct for TARGET if we want it in out/templates.
        // BUT templatesRoot (SOURCE) should be in ROOT/templates.
        // Root is ../../../ from out/test/suite? No.
        // out/test/suite -> out/test -> out -> wizly (root).
        // So ../../../ is root.
        // So templatesRoot = ../../../templates is correct for SOURCE.
        
        // Wait, where do we want to copy TO?
        // We want to copy to out/templates so that utils.resolveTemplatePath can find it.
        // utils.js is in out/utils.js.
        // resolveTemplatePath looks in `path.join(__dirname, '..', 'templates', templateFile)`.
        // __dirname of utils.js is `out`.
        // So it looks in `out/../templates` = `templates` (in root)!
        // Wait, `path.join('out', '..', 'templates')` resolves to `templates` (root).
        // So `resolveTemplatePath` looks in `ROOT/templates`.
        // So we don't need to copy templates to `out/templates` if `utils.js` looks in root!
        
        // Let's check utils.ts logic again.
        // const extensionTemplate = path.join(__dirname, '..', 'templates', templateFile);
        // If __dirname is `out`, `..` is `root`. `templates` is `root/templates`.
        // So it looks in source templates directory.
        // So we don't need to copy templates?
        
        // But in `standalone.test.ts`, we are mimicking the extension environment.
        // If we run from `out/test/suite`, `utils` is imported from `../../utils` (which is `out/utils.js`).
        // So `utils.resolveTemplatePath` will look in `out/../templates` = `templates`.
        // So it should work if `templates` folder exists in root.
        
        // However, I see I was trying to copy templates.
        // Let's correct the path to default.rules.js first.
        
        const defaultRulesPath = path.resolve(__dirname, '../../../default.rules.js');
        let rules: any[] = []; // Use 'any' to avoid strict type issues with the mock interface for now
        
        if (fs.existsSync(defaultRulesPath)) {
             const rulesModule = require(defaultRulesPath);
             const rawRules = rulesModule.rules || (rulesModule.default && rulesModule.default.rules) || rulesModule;

             if (Array.isArray(rawRules)) {
                 rules = sanitizeRules(rawRules);
             } else {
                 console.error('Raw rules is not an array!');
             }
        } else {
            console.warn('Default rules not found at', defaultRulesPath);
        }

        inputFiles.forEach(file => {
             test(`Transform: ${file}`, async () => {
                const inputPath = path.join(inputDir, file);
                const expectedPath = path.join(expectedDir, file);
                
                if (!fs.existsSync(expectedPath)) {
                    // console.warn(`Skipping test ${file}: No expected output file found.`);
                    return; // Skip this test if no expected file
                }
    
                const inputContent = fs.readFileSync(inputPath, 'utf8');
                const expectedContent = fs.readFileSync(expectedPath, 'utf8');
    
                // Mock settings
                const settings: any = {
                    transformTag: {
                        enable: false, 
                        dateFormat: 'YYYY-MM-DD',
                        timeFormat: 'HH:mm',
                        template: ''
                    },
                    smartLabelMatcher: {
                        enabled: true,
                        labelPrefix: 'L_',
                        controlPrefix: ['V_', 'P_']
                    }
                };
                
                // Disable smart label matcher for specific test case
                if (file.includes('no-label')) {
                    settings.smartLabelMatcher.enabled = false;
                }
    
                const modes = [{ name: 'Test', active: true, rules }];
    
                // Perform transformation
                const result = await transformer.transformText(inputContent, file, { modes, settings });
    
                // Normalize line endings and trim for comparison
                const normalizedResult = result.replace(/\r\n/g, '\n').trim();
                const normalizedExpected = expectedContent.replace(/\r\n/g, '\n').trim();
                
                if (normalizedResult !== normalizedExpected) {
                    console.log(`Mismatch in ${file}`);
                    // console.log('Result:', normalizedResult);
                    // console.log('Expected:', normalizedExpected);
                }
    
                assert.strictEqual(normalizedResult, normalizedExpected);
             });
        });
    } else {
        test('No Fixtures Found', () => {
            console.warn('Skipping integration tests: No fixtures found at', inputDir);
            assert.ok(true);
        });
    }
});
