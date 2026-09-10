const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTestSuite(filePath, fileName) {
    console.log(`\n========================================`);
    console.log(`🧪 Running Unit Tests for: ${fileName}`);
    console.log(`========================================`);

    const htmlContent = fs.readFileSync(filePath, 'utf8');

    // 1. Comment check
    const htmlCommentMatch = htmlContent.match(/<!--[\s\S]*?-->/);
    if (htmlCommentMatch) {
        throw new Error(`[FAIL] Found HTML comment in ${fileName}: ${htmlCommentMatch[0]}`);
    }
    console.log(`✓ [PASS] Zero HTML comments`);

    // 2. Extract scripts
    const scriptMatches = [...htmlContent.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    if (scriptMatches.length === 0) {
        throw new Error(`[FAIL] No <script> found in ${fileName}`);
    }

    const scriptCode = scriptMatches.map(m => m[1]).join('\n');

    // Check for raw JS comments if desired
    const jsBlockComment = scriptCode.match(/\/\*[\s\S]*?\*\//);
    if (jsBlockComment) {
        throw new Error(`[FAIL] Found JS block comment in ${fileName}: ${jsBlockComment[0]}`);
    }

    // 3. Setup mock DOM environment
    const elements = new Map();
    
    // Extract elements with id
    const idMatches = [...htmlContent.matchAll(/id="([^"]+)"/g)];
    idMatches.forEach(m => {
        elements.set(m[1], {
            id: m[1],
            innerText: '',
            innerHTML: '',
            style: {},
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                toggle(c, val) {
                    if (val === undefined) {
                        if (this.classes.has(c)) this.classes.delete(c);
                        else this.classes.add(c);
                    } else if (val) {
                        this.classes.add(c);
                    } else {
                        this.classes.delete(c);
                    }
                },
                contains(c) { return this.classes.has(c); }
            }
        });
    });

    // Extract elements with data-i18n
    const i18nMatches = [...htmlContent.matchAll(/data-i18n="([^"]+)"/g)];
    const i18nElements = i18nMatches.map(m => ({
        key: m[1],
        innerHTML: '',
        getAttribute(attr) { return attr === 'data-i18n' ? this.key : null; }
    }));

    const mockLocalStorage = {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = String(v); }
    };

    const mockDocument = {
        documentElement: { lang: 'en' },
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    id: id,
                    innerText: '',
                    innerHTML: '',
                    style: {},
                    classList: {
                        classes: new Set(),
                        add(c) { this.classes.add(c); },
                        remove(c) { this.classes.delete(c); },
                        toggle(c, val) { if (val) this.classes.add(c); else this.classes.delete(c); },
                        contains(c) { return this.classes.has(c); }
                    }
                });
            }
            return elements.get(id);
        },
        querySelectorAll(selector) {
            if (selector === '[data-i18n]') {
                return i18nElements;
            }
            if (selector === '.lang-btn') {
                return ['en', 'de', 'fr', 'es', 'pl'].map(lang => ({
                    innerText: lang.toUpperCase(),
                    classList: {
                        classes: new Set(),
                        toggle(c, val) { if (val) this.classes.add(c); else this.classes.delete(c); }
                    }
                }));
            }
            if (selector === '.preset-chip') {
                return ['cyberpunk', 'sunset', 'ocean', 'matrix', 'action'].map(p => ({
                    classList: {
                        classes: new Set(),
                        remove(c) { this.classes.delete(c); },
                        add(c) { this.classes.add(c); }
                    }
                }));
            }
            return [];
        }
    };

    const sandbox = {
        console: console,
        document: mockDocument,
        window: {},
        localStorage: mockLocalStorage,
        navigator: { language: 'pl-PL', languages: ['pl-PL', 'pl', 'en'] },
        event: { target: { classList: { add() {} } } }
    };

    const context = vm.createContext(sandbox);

    // 4. Execute script in VM to test syntax and logic
    try {
        vm.runInContext(scriptCode, context);
        console.log(`✓ [PASS] JavaScript syntax is 100% valid with zero errors`);
    } catch (err) {
        console.error(`\n❌ [FAIL] JS Execution Error in ${fileName}:`, err);
        throw err;
    }

    // 5. Test translations object
    let translations;
    try {
        translations = sandbox.translations || vm.runInContext('translations', context);
    } catch (e) {
        throw new Error(`[FAIL] 'translations' object not found in script scope: ${e.message}`);
    }
    if (!translations) {
        throw new Error(`[FAIL] 'translations' object is null or undefined`);
    }

    const expectedLangs = ['en', 'de', 'fr', 'es', 'pl'];
    expectedLangs.forEach(lang => {
        if (!translations[lang]) {
            throw new Error(`[FAIL] Missing language dictionary: ${lang}`);
        }
    });

    const enKeys = Object.keys(translations.en).sort();
    console.log(`✓ [PASS] English dictionary has ${enKeys.length} keys`);

    expectedLangs.forEach(lang => {
        const langKeys = Object.keys(translations[lang]).sort();
        if (langKeys.length !== enKeys.length) {
            const diff = enKeys.filter(k => !langKeys.includes(k));
            throw new Error(`[FAIL] Language ${lang} is missing keys: ${diff.join(', ')}`);
        }
    });
    console.log(`✓ [PASS] All 5 languages (EN, DE, FR, ES, PL) have 100% matching key parity`);

    // 6. Test that all HTML data-i18n tags exist in the translation dictionary
    i18nElements.forEach(el => {
        if (!translations.en[el.key]) {
            throw new Error(`[FAIL] HTML contains data-i18n="${el.key}" which is missing in translations.en!`);
        }
    });
    console.log(`✓ [PASS] All ${i18nElements.length} HTML [data-i18n] tags exist in translations`);

    // 7. Test switchLang functions
    const switchLang = sandbox.switchLang || vm.runInContext('switchLang', context);
    const detectUserLanguage = sandbox.detectUserLanguage || vm.runInContext('detectUserLanguage', context);
    const setPreset = sandbox.setPreset || vm.runInContext('setPreset', context);
    const setSides = sandbox.setSides || vm.runInContext('setSides', context);

    expectedLangs.forEach(lang => {
        switchLang(lang);
        if (mockDocument.documentElement.lang !== lang) {
            throw new Error(`[FAIL] switchLang('${lang}') did not set documentElement.lang`);
        }
        if (mockLocalStorage.getItem('hk_lang') !== lang) {
            throw new Error(`[FAIL] switchLang('${lang}') did not store choice in localStorage`);
        }
    });
    console.log(`✓ [PASS] Language switching function (switchLang) tested and verified`);

    // 8. Test auto-detection
    mockLocalStorage.store = {};
    const detectedPl = detectUserLanguage();
    if (detectedPl !== 'pl') {
        throw new Error(`[FAIL] Expected 'pl' detected for pl-PL navigator, got: ${detectedPl}`);
    }
    console.log(`✓ [PASS] Auto-language detection verified (pl-PL -> 'pl')`);

    // 9. Test simulator functions
    ['cyberpunk', 'sunset', 'ocean', 'matrix', 'action'].forEach(preset => {
        setPreset(preset);
    });
    setSides(3);
    setSides(4);
    console.log(`✓ [PASS] Simulator preset and side toggle functions tested`);

    console.log(`🎉 ALL UNIT TESTS PASSED FOR ${fileName}!\n`);
}

try {
    const devPath = path.join(__dirname, 'index.dev.html');
    const prodPath = path.join(__dirname, 'index.html');
    
    runTestSuite(devPath, 'index.dev.html');
    runTestSuite(prodPath, 'index.html');
    console.log(`\n========================================`);
    console.log(`🚀 ALL TESTS PASSED SUCCESSFULLY! Ready to publish.`);
    console.log(`========================================\n`);
} catch (e) {
    console.error(`\n❌ TEST SUITE FAILED:`, e.message);
    process.exit(1);
}
