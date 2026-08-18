/* SAT Prep — shared taxonomy
 *
 * Single source of truth for the SAT's domain/skill tree, used by:
 *   • test.html         — manual-entry domain → skill dependent selects
 *   • test-store.js     — canonicalising skill names coming out of the AI pipeline
 *   • test-history.html — grouping and labelling every skill chart
 *
 * The AI pipeline writes skills in College Board's own casing
 * ("Nonlinear functions", "Linear equations in two variables") while the app's
 * manual picker has always used Title Case ("Nonlinear Functions"). Grouping on
 * the raw string would split one skill across two bars on every chart, so every
 * skill carries a canonical key plus a list of aliases, and SAT_TAXONOMY.skillKey()
 * resolves any spelling to that key.
 */
const SAT_TAXONOMY = (() => {

    /* section: 'rw' | 'math'
     * Each skill: [canonical label, ...extra aliases]
     * The canonical label itself is always an alias, so only genuinely different
     * wordings need listing. */
    const TREE = {
        rw: {
            label: 'Reading and Writing',
            short: 'R&W',
            domains: {
                'Information and Ideas': [
                    ['Central Ideas and Details'],
                    ['Inferences'],
                    ['Command of Evidence (Textual)', 'Command of Evidence Textual', 'Textual Evidence'],
                    ['Command of Evidence (Quantitative)', 'Command of Evidence Quantitative', 'Quantitative Evidence']
                ],
                'Craft and Structure': [
                    ['Words in Context', 'Word in Context', 'Vocabulary in Context'],
                    ['Text Structure and Purpose'],
                    ['Cross-Text Connections', 'Cross Text Connections']
                ],
                'Expression of Ideas': [
                    ['Rhetorical Synthesis'],
                    ['Transitions']
                ],
                'Standard English Conventions': [
                    ['Boundaries'],
                    ['Form, Structure, and Sense', 'Form Structure and Sense']
                ]
            }
        },
        math: {
            label: 'Math',
            short: 'Math',
            domains: {
                'Algebra': [
                    ['Linear Equations in One Variable'],
                    ['Linear Equations in Two Variables'],
                    ['Linear Functions'],
                    ['Linear Inequalities in One or Two Variables'],
                    ['Systems of Two Linear Equations in Two Variables',
                     'Systems of Linear Equations in Two Variables', 'Systems of Linear Equations']
                ],
                'Advanced Math': [
                    ['Equivalent Expressions'],
                    ['Nonlinear Equations in One Variable and Systems of Equations in Two Variables',
                     'Nonlinear Equations in One Variable and Systems',
                     'Nonlinear Equations and Systems'],
                    ['Nonlinear Functions']
                ],
                'Problem-Solving and Data Analysis': [
                    ['Percentages'],
                    ['Ratios, Rates, Proportions, and Units',
                     'Ratios, Rates, and Proportional Relationships', 'Ratios Rates and Proportions'],
                    ['One-Variable Data: Distributions and Measures of Center/Spread',
                     'One-Variable Data (Distributions and Measures)', 'One-Variable Data'],
                    ['Two-Variable Data: Models and Scatterplots',
                     'Two-Variable Data (Scatterplots)', 'Two-Variable Data'],
                    ['Probability and Conditional Probability'],
                    ['Inference from Sample Statistics and Margin of Error',
                     'Inference from Sample Statistics'],
                    ['Evaluating Statistical Claims: Observational Studies and Experiments',
                     'Evaluating Statistical Claims']
                ],
                'Geometry and Trigonometry': [
                    ['Area and Volume'],
                    ['Lines, Angles, and Triangles'],
                    ['Right Triangles and Trigonometry'],
                    ['Circles']
                ]
            }
        }
    };

    /* ── Flatten ──────────────────────────────────────────────── */
    const SKILLS   = [];   // { key, label, section, domain, aliases[] }
    const BY_KEY   = {};
    const ALIAS_IX = {};   // normalised alias → key

    function norm(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
    function slug(s) {
        return norm(s).replace(/ /g, '-') || 'unknown';
    }

    for (const [section, sec] of Object.entries(TREE)) {
        for (const [domain, skills] of Object.entries(sec.domains)) {
            for (const aliases of skills) {
                const label = aliases[0];
                const key   = slug(label);
                const entry = { key, label, section, domain, aliases };
                SKILLS.push(entry);
                BY_KEY[key] = entry;
                aliases.forEach(a => { ALIAS_IX[norm(a)] = key; });
            }
        }
    }

    /* Domain → section lookup, plus alias handling for domain names. */
    const DOMAIN_SECTION = {};
    for (const [section, sec] of Object.entries(TREE)) {
        Object.keys(sec.domains).forEach(d => { DOMAIN_SECTION[norm(d)] = section; });
    }
    // Domain aliases seen in pipeline output
    DOMAIN_SECTION[norm('Problem Solving and Data Analysis')] = 'math';
    DOMAIN_SECTION[norm('Geometry and Trigonometry')]         = 'math';

    /* Skills the pipeline emits that aren't in the official tree still need to
     * chart. resolve() returns a synthetic entry rather than dropping them. */
    function resolve(rawSkill, rawDomain) {
        const n = norm(rawSkill);
        if (!n) return null;
        const key = ALIAS_IX[n];
        if (key) return BY_KEY[key];

        // Unknown skill — keep the source's own wording, infer the section.
        const domainSection = DOMAIN_SECTION[norm(rawDomain)];
        return {
            key:     slug(rawSkill),
            label:   String(rawSkill),
            section: domainSection || 'rw',
            domain:  rawDomain || 'Other',
            aliases: [rawSkill],
            unknown: true
        };
    }

    /* Error patterns the pipeline has produced, offered as manual-entry
     * suggestions. Free text is always allowed — this is a datalist, not a
     * closed vocabulary, because the useful patterns are personal. */
    const ERROR_PATTERNS = {
        rw: [
            'Missed negation/contrast logic',
            'Missed contrast-signal pattern',
            'Vocabulary near-miss',
            'Weak evidence-claim match',
            'Function-of-sentence confusion',
            'Comma-splice/run-on distinction miss',
            'Restrictive vs. nonrestrictive modifier confusion',
            'Proximity/agreement trap',
            'Complex series punctuation trap',
            'Overlooked scope of the claim',
            'Picked a true-but-irrelevant answer',
            'Rushed — misread the question stem'
        ],
        math: [
            'Multi-step algebraic setup error',
            'Arithmetic slip',
            'Exponent rule error',
            'Sign error',
            'Coefficient-as-rate misinterpretation',
            'Inequality direction/translation error',
            'No-solution condition misapplied',
            'Discriminant condition misapplied',
            'Sequential percent operations error',
            'Weighted mean vs. simple average confusion',
            'Effect-of-constant-shift misconception',
            'Solved for the wrong quantity',
            'Ran out of time — guessed',
            'Units/conversion error'
        ]
    };

    const MODULES = [
        { slug: 'rw1', label: 'RW Module 1',   short: 'RW 1', section: 'rw',   count: 27 },
        { slug: 'rw2', label: 'RW Module 2',   short: 'RW 2', section: 'rw',   count: 27 },
        { slug: 'm1',  label: 'Math Module 1', short: 'M 1',  section: 'math', count: 22 },
        { slug: 'm2',  label: 'Math Module 2', short: 'M 2',  section: 'math', count: 22 }
    ];
    const MODULE_BY_SLUG = Object.fromEntries(MODULES.map(m => [m.slug, m]));

    return {
        TREE, SKILLS, MODULES, MODULE_BY_SLUG, ERROR_PATTERNS,

        norm, slug,
        skillKey:   (raw, domain) => (resolve(raw, domain) || {}).key || null,
        skillLabel: (key) => (BY_KEY[key] || {}).label || key,
        skill:      (key) => BY_KEY[key] || null,
        resolve,

        sectionOfDomain: (d) => DOMAIN_SECTION[norm(d)] || null,
        domainsOf:       (section) => Object.keys(TREE[section] ? TREE[section].domains : {}),
        skillsOf:        (section, domain) => SKILLS.filter(s => s.section === section && s.domain === domain),
        sectionOfModule: (slug) => (MODULE_BY_SLUG[slug] || {}).section || 'rw'
    };
})();
