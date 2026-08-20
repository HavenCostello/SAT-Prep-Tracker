/* SAT Prep — Practice question bank
 *
 * Backs the "Practice Now" tab. Every skill in SAT_TAXONOMY has content here:
 *   • Math skills   → procedural generators (unlimited, randomized, always correct)
 *   • R&W skills    → a curated static bank (finite; cycles with a reshuffle
 *                     and a "repeated" flag once a quiz asks for more than the
 *                     bank holds)
 *
 * Depends on: sat-taxonomy.js
 */
const PRACTICE_BANK = (() => {
    const T = SAT_TAXONOMY;

    /* ── RNG-agnostic helpers (default to Math.random, but every generator
       accepts an rng() => [0,1) so a caller could seed it later) ── */
    function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
    function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
    function shuffle(rng, arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
    function fmtSigned(n) { return n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`; }

    /* Builds a 4-way multiple choice from a correct value and a pool of
     * candidate distractors, deduping by formatted string and padding with
     * numeric jitter if the pool didn't supply enough distinct options. */
    function buildChoices(rng, correct, distractorPool, fmt = String) {
        const seen = new Set([fmt(correct)]);
        const uniq = [];
        for (const d of distractorPool) {
            const s = fmt(d);
            if (!seen.has(s)) { seen.add(s); uniq.push(d); }
            if (uniq.length >= 3) break;
        }
        let guard = 0;
        while (uniq.length < 3 && guard < 30) {
            guard++;
            const base = typeof correct === 'number' ? correct : 0;
            const jitter = base + randInt(rng, 1, 6) * (rng() < 0.5 ? -1 : 1);
            const s = fmt(jitter);
            if (!seen.has(s)) { seen.add(s); uniq.push(jitter); }
        }
        const options = shuffle(rng, [correct, ...uniq.slice(0, 3)]);
        return { choices: options.map(fmt), correctIndex: options.indexOf(correct) };
    }

    /* ══════════════════════════════════════════════════════════
       Math — procedural generators, one per skill, keyed by canonical label
    ══════════════════════════════════════════════════════════ */

    function genLinEq1(rng) {
        const a = randInt(rng, 2, 9);
        let x = randInt(rng, -9, 9); if (x === 0) x = 4;
        const b = randInt(rng, -15, 15);
        const c = a * x + b;
        const { choices, correctIndex } = buildChoices(rng, x, [x + a, x - a, -x, x + b]);
        return {
            prompt: `Solve for x: ${a}x ${fmtSigned(b)} = ${c}`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `Subtract ${b} from both sides to get ${a}x = ${c - b}, then divide by ${a} to get x = ${x}.`
        };
    }

    function genLinEq2(rng) {
        const m = randInt(rng, -6, 6) || 3;
        const x1 = randInt(rng, -8, 8);
        const y1 = randInt(rng, -20, 20);
        const b = y1 - m * x1;
        const { choices, correctIndex } = buildChoices(rng, b, [y1 + m * x1, -b, b + m, y1]);
        return {
            prompt: `A line has a slope of ${m} and passes through the point (${x1}, ${y1}). What is the line's y-intercept?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `Using y = mx + b: ${y1} = ${m}(${x1}) + b, so b = ${y1} − ${m * x1} = ${b}.`
        };
    }

    function genLinFunctions(rng) {
        const m = randInt(rng, -5, 5) || 2;
        const b = randInt(rng, -10, 10);
        const k = randInt(rng, -6, 6);
        const value = m * k + b;
        const { choices, correctIndex } = buildChoices(rng, value, [m * k - b, m + k + b, value + m, value - 1]);
        return {
            prompt: `If f(x) = ${m}x ${fmtSigned(b)}, what is f(${k})?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `f(${k}) = ${m}(${k}) ${fmtSigned(b)} = ${m * k} ${fmtSigned(b)} = ${value}.`
        };
    }

    function genLinIneq(rng) {
        let a = randInt(rng, 2, 6); if (rng() < 0.5) a = -a;
        const b = randInt(rng, -10, 10);
        const x0 = randInt(rng, -8, 8);
        const c = a * x0 + b;
        const dir = a > 0 ? '>' : '<';
        const flip = dir === '>' ? '<' : '>';
        const correct = `x ${dir} ${x0}`;
        const distractors = [`x ${flip} ${x0}`, `x ${dir} ${x0 + 1}`, `x ${flip} ${x0 - 1}`];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        return {
            prompt: `Solve the inequality: ${a}x ${fmtSigned(b)} > ${c}`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `Isolate x: ${a}x > ${c - b}. Dividing by ${a} (${a < 0 ? 'negative, so flip the sign' : 'positive'}) gives ${correct}.`
        };
    }

    function genSystems(rng) {
        const x0 = randInt(rng, -6, 6), y0 = randInt(rng, -6, 6);
        let a1, b1, c1, a2, b2, c2;
        do {
            a1 = randInt(rng, 1, 5); b1 = randInt(rng, 1, 5); c1 = a1 * x0 + b1 * y0;
            a2 = randInt(rng, 1, 5); b2 = -randInt(rng, 1, 5); c2 = a2 * x0 + b2 * y0;
        } while (a1 * b2 - a2 * b1 === 0);
        const { choices, correctIndex } = buildChoices(rng, x0, [y0, x0 + y0, -x0, x0 + 1]);
        return {
            prompt: `Solve the system for x:\n${a1}x + ${b1}y = ${c1}\n${a2}x ${b2 < 0 ? '- ' + Math.abs(b2) : '+ ' + b2}y = ${c2}`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `The system's solution is (x, y) = (${x0}, ${y0}), so x = ${x0}.`
        };
    }

    function genEquivExpr(rng) {
        const a = randInt(rng, 2, 6), b = randInt(rng, -6, 6), c = randInt(rng, 1, 6);
        const coefX = a + c, constTerm = a * b;
        const fmtExpr = (coef, cst) => `${coef}x ${fmtSigned(cst)}`;
        const correct = fmtExpr(coefX, constTerm);
        const distractors = [fmtExpr(a + c, b), fmtExpr(a * c, constTerm), fmtExpr(coefX, a + b)];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        return {
            prompt: `Which expression is equivalent to ${a}(x ${fmtSigned(b)}) + ${c}x?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `Distribute: ${a}(x ${fmtSigned(b)}) = ${a}x ${fmtSigned(a * b)}. Add ${c}x: (${a}+${c})x ${fmtSigned(a * b)} = ${correct}.`
        };
    }

    function genNonlinEq(rng) {
        let r1 = randInt(rng, -8, 8), r2 = randInt(rng, -8, 8);
        if (r1 === r2) r2 = r1 + 1;
        const b = -(r1 + r2), c = r1 * r2;
        const correct = `x = ${r1} or x = ${r2}`;
        const distractors = [`x = ${-r1} or x = ${-r2}`, `x = ${r1} or x = ${-r2}`, `x = ${r1 + 1} or x = ${r2 - 1}`];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        return {
            prompt: `What are the solutions to x² ${fmtSigned(b)}x ${fmtSigned(c)} = 0?`,
            choices, correctIndex, difficulty: 'Hard',
            explanation: `Factor as (x ${fmtSigned(-r1)})(x ${fmtSigned(-r2)}) = 0, so x = ${r1} or x = ${r2}.`
        };
    }

    function genNonlinFunc(rng) {
        const N = randInt(rng, 2, 9) * 100, p = randInt(rng, 2, 20), t = randInt(rng, 2, 5);
        const value = Math.round(N * Math.pow(1 + p / 100, t));
        const distractors = [
            Math.round(N * (1 + p / 100 * t)),
            Math.round(N * Math.pow(1 - p / 100, t)),
            Math.round(N * Math.pow(1 + p / 100, t + 1))
        ];
        const { choices, correctIndex } = buildChoices(rng, value, distractors);
        return {
            prompt: `A population starts at ${N} and grows ${p}% each year. Rounded to the nearest whole number, what is the population after ${t} years?`,
            choices, correctIndex, difficulty: 'Hard',
            explanation: `Use N(1 + p/100)^t = ${N}(1 + ${p}/100)^${t} ≈ ${value}.`
        };
    }

    function genPercentages(rng) {
        const base = randInt(rng, 20, 50) * 10, p = randInt(rng, 5, 60);
        if (rng() < 0.5) {
            const value = Math.round(base * (1 + p / 100));
            const distractors = [Math.round(base * p / 100), Math.round(base * (1 - p / 100)), value + 1];
            const { choices, correctIndex } = buildChoices(rng, value, distractors);
            return {
                prompt: `A value of ${base} is increased by ${p}%. What is the new value?`,
                choices, correctIndex, difficulty: 'Easy',
                explanation: `"Increased by" means new = original × (1 + ${p}/100) = ${base} × ${(1 + p / 100).toFixed(2)} ≈ ${value}.`
            };
        }
        const value = Math.round(base * p / 100);
        const distractors = [Math.round(base * (1 + p / 100)), base, value + 5];
        const { choices, correctIndex } = buildChoices(rng, value, distractors);
        return {
            prompt: `A value of ${base} is increased to ${p}% of its original value. What is the new value?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `"Increased to X%" means new = original × (${p}/100) = ${base} × ${(p / 100).toFixed(2)} ≈ ${value}.`
        };
    }

    function genRatios(rng) {
        const d = randInt(rng, 2, 9) * 10, h = randInt(rng, 2, 6), H = randInt(rng, h + 1, h + 6);
        const rate = d / h, value = Math.round(rate * H);
        const distractors = [Math.round(d * H / (h + 1)), d + H, Math.round(rate * (H - 1))];
        const { choices, correctIndex } = buildChoices(rng, value, distractors);
        return {
            prompt: `A car travels ${d} miles in ${h} hours at a constant rate. At the same rate, how many miles will it travel in ${H} hours?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `Unit rate = ${d}/${h} = ${rate.toFixed(2)} miles/hour. Distance in ${H} hours ≈ ${rate.toFixed(2)} × ${H} ≈ ${value} miles.`
        };
    }

    function genOneVarData(rng) {
        const nums = Array.from({ length: 5 }, () => randInt(rng, 1, 50));
        const sorted = [...nums].sort((a, b) => a - b);
        const median = sorted[2];
        const mean = +(nums.reduce((a, b) => a + b, 0) / 5).toFixed(1);
        const distractors = [mean, sorted[1], sorted[3]];
        const { choices, correctIndex } = buildChoices(rng, median, distractors);
        return {
            prompt: `What is the median of this data set: ${nums.join(', ')}?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `Sorted: ${sorted.join(', ')}. The median is the middle value: ${median}.`
        };
    }

    function genTwoVarData(rng) {
        const m = randInt(rng, -6, 6) || 2, b = randInt(rng, -10, 10);
        let k = randInt(rng, 2, 5); if (rng() < 0.5) k = -k;
        const newM = m * k;
        const distractors = [m, m + k, m * k + b];
        const { choices, correctIndex } = buildChoices(rng, newM, distractors);
        return {
            prompt: `A line of best fit is y = ${m}x ${fmtSigned(b)}. If every y-value in the data set is multiplied by ${k}, what is the slope of the new line of best fit?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `Multiplying every y-value by a constant scales both slope and intercept by that constant: new slope = ${k} × ${m} = ${newM}.`
        };
    }

    function genProbability(rng) {
        const r = randInt(rng, 2, 9), bl = randInt(rng, 2, 9);
        const total = r + bl, g = gcd(r, total);
        const frac = (num, den) => `${num}/${den}`;
        const correct = frac(r / g, total / g);
        const distractors = [frac(bl / g, total / g), frac(r, total), frac(r, bl)];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        return {
            prompt: `A bag contains ${r} red marbles and ${bl} blue marbles. What is the probability of randomly selecting a red marble, written as a fraction in lowest terms?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `P(red) = red / total = ${r}/${total}${g > 1 ? `, which reduces to ${r / g}/${total / g}` : ''}.`
        };
    }

    const INFERENCE_POOL = [
        {
            prompt: 'A researcher wants to estimate the average height of all students at a large university. She surveys 50 students who happen to be walking out of the campus gym. Why might her sample lead to an unreliable estimate?',
            choices: ['The sample size is too large to be practical', 'The sample was not randomly selected, so it may not represent the whole student population', 'Height cannot be measured accurately', 'The margin of error will always be zero'],
            correctIndex: 1,
            explanation: 'A sample drawn only from gym-goers is not random and likely skews toward more athletic students, so it may not represent the full student population.'
        },
        {
            prompt: 'A pollster surveys 1,000 randomly selected registered voters and reports the result with a margin of error of ±3 percentage points. What does that margin of error most directly indicate?',
            choices: ['The poll is definitely wrong', 'The true population value likely falls within 3 points of the reported result', 'Only 3% of voters were surveyed', 'The sample was not random'],
            correctIndex: 1,
            explanation: 'A margin of error describes a range around the sample statistic within which the true population value likely falls — it does not mean the poll is inaccurate.'
        },
        {
            prompt: 'A study finds that a new medication improved symptoms in a sample of 30 volunteers who chose to participate after hearing about the drug\'s early promise. Why is this study\'s generalizability limited?',
            choices: ['30 volunteers is always too few for any conclusion', 'Volunteers who chose to join may differ systematically from the general patient population', 'Medications cannot be tested on volunteers', 'The margin of error was not reported'],
            correctIndex: 1,
            explanation: 'A self-selected sample (volunteers drawn to the drug\'s promise) may not represent the broader population, limiting how far the results can be generalized.'
        }
    ];

    const EVAL_CLAIMS_POOL = [
        {
            prompt: 'Ice cream sales and drowning incidents both rise every summer. A news article concludes that ice cream sales cause drownings. What is the flaw in this reasoning?',
            choices: ['The article confuses correlation with causation; a third factor (warm weather) likely explains both', 'Ice cream cannot be purchased near water', 'Drowning incidents are undercounted in summer', 'The data was not collected in the same year'],
            correctIndex: 0,
            explanation: 'Two things rising together (correlation) doesn\'t mean one causes the other — warm weather plausibly drives both ice cream sales and swimming, and thus drownings.'
        },
        {
            prompt: 'A company tests a new fertilizer on plants in a greenhouse with ideal light and water, then claims the fertilizer will produce identical results for outdoor gardeners. What is the main problem with this claim?',
            choices: ['The claim overgeneralizes results from controlled greenhouse conditions to less controlled outdoor conditions', 'Fertilizer cannot be tested on plants', 'Greenhouses are more expensive than gardens', 'The company did not use a large enough greenhouse'],
            correctIndex: 0,
            explanation: 'Results from a tightly controlled environment don\'t automatically transfer to a more variable, uncontrolled setting like an outdoor garden.'
        },
        {
            prompt: 'An observational study finds that people who exercise regularly report lower stress levels than those who don\'t, and a headline claims exercise reduces stress. What would strengthen this causal claim?',
            choices: ['A larger sample size alone', 'A randomized controlled experiment assigning exercise versus no exercise', 'Asking more detailed survey questions', 'Repeating the same observational study'],
            correctIndex: 1,
            explanation: 'An observational study can only show association; a randomized experiment, which controls who exercises, is needed to support a causal claim.'
        }
    ];

    function genInference(rng) {
        const q = pick(rng, INFERENCE_POOL);
        return { ...q, difficulty: 'Medium' };
    }
    function genEvalClaims(rng) {
        const q = pick(rng, EVAL_CLAIMS_POOL);
        return { ...q, difficulty: 'Medium' };
    }

    function genAreaVolume(rng) {
        const l = randInt(rng, 2, 12), w = randInt(rng, 2, 12), h = randInt(rng, 2, 12);
        const value = l * w * h;
        const distractors = [l * w + h, 2 * (l * w + w * h + l * h), l + w + h];
        const { choices, correctIndex } = buildChoices(rng, value, distractors);
        return {
            prompt: `A rectangular box has a length of ${l}, a width of ${w}, and a height of ${h}. What is its volume?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `Volume = length × width × height = ${l} × ${w} × ${h} = ${value}.`
        };
    }

    const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [7, 24, 25]];

    function genLinesAnglesTriangles(rng) {
        const t = pick(rng, TRIPLES), scale = randInt(rng, 1, 3);
        const [a, b, c] = t.map(v => v * scale);
        if (rng() < 0.6) {
            const distractors = [a + b, c + scale, c - scale];
            const { choices, correctIndex } = buildChoices(rng, c, distractors);
            return {
                prompt: `A right triangle has legs of length ${a} and ${b}. What is the length of the hypotenuse?`,
                choices, correctIndex, difficulty: 'Medium',
                explanation: `By the Pythagorean theorem, c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, so c = ${c}.`
            };
        }
        const distractors = [c - a, a + (c - a), b + scale];
        const { choices, correctIndex } = buildChoices(rng, b, distractors);
        return {
            prompt: `A right triangle has a hypotenuse of length ${c} and one leg of length ${a}. What is the length of the other leg?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `By the Pythagorean theorem, the missing leg = √(${c}² − ${a}²) = √${c * c - a * a} = ${b}.`
        };
    }

    function genRightTriTrig(rng) {
        const t = pick(rng, TRIPLES), scale = randInt(rng, 1, 3);
        const [a, b, c] = t.map(v => v * scale);
        const g1 = gcd(a, c), g2 = gcd(b, c), g3 = gcd(a, b);
        const sinStr = `${a / g1}/${c / g1}`, cosStr = `${b / g2}/${c / g2}`, tanStr = `${a / g3}/${b / g3}`;
        const kind = pick(rng, ['sine', 'cosine', 'tangent']);
        const map = { sine: [sinStr, [cosStr, tanStr, `${c / g1}/${a / g1}`]], cosine: [cosStr, [sinStr, tanStr, `${c / g2}/${b / g2}`]], tangent: [tanStr, [sinStr, cosStr, `${b / g3}/${a / g3}`]] };
        const [correct, distractors] = map[kind];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        const fn = kind === 'sine' ? 'sin(A)' : kind === 'cosine' ? 'cos(A)' : 'tan(A)';
        return {
            prompt: `In a right triangle, the side opposite angle A has length ${a}, the side adjacent to angle A has length ${b}, and the hypotenuse has length ${c}. What is ${fn}, expressed as a fraction in lowest terms?`,
            choices, correctIndex, difficulty: 'Medium',
            explanation: `${fn.split('(')[0]} = ${kind === 'sine' ? 'opposite/hypotenuse' : kind === 'cosine' ? 'adjacent/hypotenuse' : 'opposite/adjacent'} = ${correct}.`
        };
    }

    function genCircles(rng) {
        const r = randInt(rng, 2, 12);
        if (rng() < 0.5) {
            const correct = `${r * r}π`;
            const distractors = [`${2 * r}π`, `${r * r * 2}π`, `${r}π`];
            const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
            return {
                prompt: `A circle has a radius of ${r}. What is its area in terms of π?`,
                choices, correctIndex, difficulty: 'Easy',
                explanation: `Area = πr² = π(${r})² = ${r * r}π.`
            };
        }
        const correct = `${2 * r}π`;
        const distractors = [`${r * r}π`, `${r}π`, `${2 * r + 2}π`];
        const { choices, correctIndex } = buildChoices(rng, correct, distractors, v => v);
        return {
            prompt: `A circle has a radius of ${r}. What is its circumference in terms of π?`,
            choices, correctIndex, difficulty: 'Easy',
            explanation: `Circumference = 2πr = 2π(${r}) = ${2 * r}π.`
        };
    }

    const MATH_GEN_DEFS = [
        ['Linear Equations in One Variable', genLinEq1],
        ['Linear Equations in Two Variables', genLinEq2],
        ['Linear Functions', genLinFunctions],
        ['Linear Inequalities in One or Two Variables', genLinIneq],
        ['Systems of Two Linear Equations in Two Variables', genSystems],
        ['Equivalent Expressions', genEquivExpr],
        ['Nonlinear Equations in One Variable and Systems of Equations in Two Variables', genNonlinEq],
        ['Nonlinear Functions', genNonlinFunc],
        ['Percentages', genPercentages],
        ['Ratios, Rates, Proportions, and Units', genRatios],
        ['One-Variable Data: Distributions and Measures of Center/Spread', genOneVarData],
        ['Two-Variable Data: Models and Scatterplots', genTwoVarData],
        ['Probability and Conditional Probability', genProbability],
        ['Inference from Sample Statistics and Margin of Error', genInference],
        ['Evaluating Statistical Claims: Observational Studies and Experiments', genEvalClaims],
        ['Area and Volume', genAreaVolume],
        ['Lines, Angles, and Triangles', genLinesAnglesTriangles],
        ['Right Triangles and Trigonometry', genRightTriTrig],
        ['Circles', genCircles]
    ];
    const MATH_GEN = {};
    MATH_GEN_DEFS.forEach(([label, fn]) => { MATH_GEN[T.skillKey(label)] = fn; });

    /* ══════════════════════════════════════════════════════════
       Reading & Writing — curated static bank, keyed by canonical label
    ══════════════════════════════════════════════════════════ */

    const RW_BANK_DEFS = {
        'Central Ideas and Details': [
            { prompt: "Marine biologists have long assumed that octopuses are solitary creatures, avoiding contact with others of their kind except to mate. Recent underwater footage, however, has captured groups of octopuses gathering at a single reef repeatedly over several months, sharing dens and even appearing to communicate through color changes.\n\nWhich choice best states the main idea of the text?", choices: ['Octopuses are far more intelligent than most marine animals.', 'New footage challenges the assumption that octopuses are solitary.', 'Octopuses communicate exclusively through color changes.', 'Marine biologists have stopped studying octopus behavior.'], correctIndex: 1, explanation: 'The passage centers on footage that contradicts the long-held assumption of octopus solitude. The reef gathering and color changes are supporting details, not the main idea.' },
            { prompt: "The city's new bike-share program logged over 40,000 rides in its first month, far exceeding planners' projections of 15,000. Officials attribute the surge to unusually mild weather and a marketing campaign that offered free first rides to new users.\n\nWhich choice best describes the central idea of the text?", choices: ['The bike-share program failed to meet its goals.', 'Ridership vastly exceeded projections, likely due to weather and marketing.', 'The city plans to end the free-ride promotion.', 'Mild weather is the only reason for the program\'s success.'], correctIndex: 1, explanation: 'The central idea is the surprising ridership surge and the two factors officials cite for it; choice D overstates by claiming weather was the "only" reason.' },
            { prompt: "While early critics dismissed the artist's abstract paintings as chaotic, later scholars identified a consistent underlying structure: each canvas was built on a hidden grid that dictated the placement of every shape.\n\nWhich choice best states the central idea of the text?", choices: ['Critics were correct that the paintings lacked structure.', 'Later scholars found deliberate structure the artist\'s critics initially missed.', 'The artist rejected the use of grids entirely.', 'Abstract painting is inherently chaotic.'], correctIndex: 1, explanation: 'The passage contrasts early dismissal with a later discovery of hidden order, making the "structure the critics missed" the central idea.' },
            { prompt: "Coral reefs cover less than 1 percent of the ocean floor, yet they support roughly a quarter of all known marine species, making them among the most biologically dense ecosystems on Earth.\n\nWhich choice best supports the idea that coral reefs are exceptionally biodiverse?", choices: ['Reefs cover less than 1 percent of the ocean floor.', 'Reefs support about a quarter of known marine species despite their small area.', 'Coral reefs are found throughout the world\'s oceans.', 'Marine species are declining worldwide.'], correctIndex: 1, explanation: 'The detail that a tiny area of ocean floor supports a quarter of known species is the direct evidence of extreme biodiversity density.' },
            { prompt: "The novel's protagonist insists throughout the story that she has no interest in her family's estate, yet she returns to inspect it three times before the final chapter.\n\nWhich choice best identifies the central tension the text describes?", choices: ['The protagonist openly admits her attachment to the estate.', 'The protagonist\'s stated indifference conflicts with her repeated visits.', 'The protagonist sells the estate early in the novel.', 'The family estate is destroyed by the end of the story.'], correctIndex: 1, explanation: 'The passage highlights a contradiction between what the protagonist claims and what she does — that gap is the central tension.' }
        ],
        'Inferences': [
            { prompt: "Every previous model of the bridge collapsed under half the intended load. The engineers spent an additional eighteen months reinforcing the support beams before the final design was approved.\n\nWhich choice most logically completes the text's implication?", choices: ['The final design likely used weaker beams than earlier models.', 'The reinforcement was intended to address the earlier structural failures.', 'The bridge was never actually built.', 'Eighteen months was considered too long for the project.'], correctIndex: 1, explanation: 'The extra reinforcement time directly follows the mention of earlier collapses, implying it addressed that specific weakness.' },
            { prompt: "The company's quarterly report boasted record profits, yet it made no mention of the factory closures that had eliminated a third of its workforce that same year.\n\nWhich choice is most strongly supported by the text?", choices: ['The factory closures had no effect on profits.', 'The report may be presenting an incomplete picture of the company\'s year.', 'The company plans to reopen the factories.', 'Profits declined because of the closures.'], correctIndex: 1, explanation: 'Omitting a major event like mass layoffs from an otherwise glowing report suggests the account may be selectively framed.' },
            { prompt: "Despite living only two miles apart for twenty years, the two scientists never collaborated until a chance meeting at a conference overseas finally connected them.\n\nWhich inference is best supported by the text?", choices: ['The scientists were rivals who refused to work together.', 'Geographic proximity does not guarantee collaboration.', 'International conferences are more useful than local ones in every case.', 'The scientists disliked traveling.'], correctIndex: 1, explanation: 'Two nearby scientists who didn\'t collaborate until traveling far away supports the idea that proximity alone doesn\'t cause collaboration.' },
            { prompt: "The museum's most popular exhibit, a hands-on model of the solar system, was quietly removed last spring after budget cuts, while a smaller, less-visited gallery remained untouched.\n\nWhich choice is most strongly suggested by the text?", choices: ['The removed exhibit was the museum\'s least expensive to maintain.', 'Budget decisions may not always align with visitor popularity.', 'The museum plans to close permanently.', 'Visitors preferred the smaller gallery.'], correctIndex: 1, explanation: 'A popular exhibit being cut while a less-visited one stays implies the cuts weren\'t driven purely by visitor popularity.' },
            { prompt: "The recipe has been passed down for four generations, yet the great-granddaughter who now makes it always doubles the amount of garlic listed in the original handwritten card.\n\nWhich choice is most reasonably inferred from the text?", choices: ['The original recipe\'s garlic amount no longer matches what is actually used.', 'The great-granddaughter dislikes garlic.', 'The recipe card has been lost.', 'Garlic was not part of the original recipe.'], correctIndex: 0, explanation: 'If she doubles the listed amount every time, then what\'s written no longer reflects what\'s actually made.' }
        ],
        'Command of Evidence (Textual)': [
            { prompt: "Claim: The author argues that the invention of the printing press changed not just how information spread, but who controlled it.\n\nWhich quotation from a source would most effectively support this claim?", choices: ['"Books had existed for centuries before Gutenberg\'s press."', '"Once anyone with access to a press could publish, the church and crown no longer held sole authority over written knowledge."', '"The printing press used movable metal type."', '"Gutenberg was born in the German city of Mainz."'], correctIndex: 1, explanation: 'Only this option addresses the shift in who controlled information — the second half of the claim — while the others are unrelated facts.' },
            { prompt: "Claim: The writer contends that the town's economic recovery depended more on tourism than on its historic manufacturing base.\n\nWhich quotation would most effectively support this claim?", choices: ['"The town\'s factories closed permanently in the 1980s."', '"By 2010, tourism revenue accounted for nearly 70 percent of the town\'s income, up from almost nothing two decades earlier."', '"The town square was renovated using state grant money."', '"Manufacturing jobs are typically higher-paying than tourism jobs."'], correctIndex: 1, explanation: 'This option directly quantifies tourism\'s dominant share of the town\'s income, matching the claim\'s specific comparison.' },
            { prompt: "Claim: The researcher asserts that sleep deprivation impairs decision-making more than it impairs physical reaction time.\n\nWhich quotation would most effectively support this claim?", choices: ['"Participants who slept four hours made 35 percent more risky financial choices, while their reaction times dropped by only 5 percent."', '"All participants were tested in the same room."', '"Sleep deprivation is common among college students."', '"Reaction time was measured using a simple button-press test."'], correctIndex: 0, explanation: 'Only this option gives a direct comparison showing decision-making was affected far more than reaction time, matching the exact claim.' },
            { prompt: "Claim: The historian argues that the treaty's language was deliberately vague to allow both nations to claim victory.\n\nWhich quotation would most effectively support this claim?", choices: ['"The treaty was signed in a neutral country."', '"Negotiators later admitted they chose wording that let each government tell its own citizens they had won."', '"The treaty ended a conflict that had lasted six years."', '"Both nations sent delegations of equal size."'], correctIndex: 1, explanation: 'Only this option directly addresses intentional vagueness enabling both sides to claim victory.' },
            { prompt: "Claim: The columnist claims that remote work has not reduced overall hours employees spend on work-related tasks.\n\nWhich quotation would most effectively support this claim?", choices: ['"Remote employees report saving an average of 45 minutes per day by skipping their commute."', '"A survey found remote workers logged 2.5 more hours per week than they had in the office, often checking messages after dinner."', '"Most companies now offer some form of remote work option."', '"Remote work became widespread starting in 2020."'], correctIndex: 1, explanation: 'Only this option provides evidence that total work hours increased, directly supporting the claim.' }
        ],
        'Command of Evidence (Quantitative)': [
            { prompt: "Claim: A researcher claims that daily screen time among teens rose sharply between 2015 and 2020.\n\nData: In 2015, average daily screen time was 3.5 hours; in 2018, 4.8 hours; in 2020, 7.2 hours.\n\nWhich figure best supports the claim of a sharp rise specifically between 2015 and 2020?", choices: ['The 2015 average of 3.5 hours alone.', 'The increase from 3.5 hours in 2015 to 7.2 hours in 2020.', 'The 2018 average of 4.8 hours alone.', 'The fact that the data was collected via self-report surveys.'], correctIndex: 1, explanation: 'Only the direct 2015-to-2020 comparison demonstrates the sharp rise the claim describes.' },
            { prompt: "Claim: A city planner argues that a new bus route reduced car traffic on Main Street.\n\nData: Before the route launched, Main Street averaged 12,000 cars/day. Six months after launch, it averaged 9,600 cars/day, while bus ridership on the new route reached 1,800 riders/day.\n\nWhich piece of data most directly supports the claim?", choices: ['The bus route added 1,800 new daily riders.', 'The drop from 12,000 to 9,600 cars per day on Main Street after the route launched.', 'The route began operating six months ago.', 'Main Street is the city\'s busiest road.'], correctIndex: 1, explanation: 'The claim is specifically about car traffic reduction, so the before/after car-count comparison is the direct supporting evidence.' },
            { prompt: "Claim: A nutrition study concludes that a new diet plan led to greater weight loss than the standard plan over 12 weeks.\n\nData: Standard-plan participants lost an average of 4 lbs; new-plan participants lost an average of 9 lbs, with similar starting weights and adherence rates in both groups.\n\nWhich detail best supports the study's conclusion?", choices: ['Both groups had similar starting weights and adherence.', 'The 9 lbs versus 4 lbs difference in average weight loss between the groups.', 'The study lasted 12 weeks.', 'Participants were divided into two groups.'], correctIndex: 1, explanation: 'The direct comparison of average weight loss (9 vs. 4 lbs) is the quantitative evidence for the claim.' },
            { prompt: "Claim: An economist argues that a state's minimum wage increase did not significantly affect its unemployment rate.\n\nData: Before the increase, state unemployment was 4.1%. One year after, it was 4.3%, while the national rate rose from 4.0% to 4.4% over the same period.\n\nWhich comparison best supports the claim?", choices: ['The state\'s unemployment rose from 4.1% to 4.3%.', 'The state\'s small 0.2-point rise closely tracked the larger 0.4-point national rise, suggesting other factors were at play.', 'The national rate was higher than the state rate in both years.', 'Unemployment data is reported annually.'], correctIndex: 1, explanation: 'Comparing the state\'s modest change to a similar (even larger) national trend supports the claim that the wage increase itself wasn\'t the main driver.' },
            { prompt: "Claim: A public health official states that a vaccination campaign significantly slowed the spread of an outbreak.\n\nData: In the four weeks before the campaign, cases rose by an average of 22% per week. In the four weeks after, cases rose by an average of 3% per week.\n\nWhich figure best supports the claim?", choices: ['The campaign began four weeks after the outbreak was first detected.', 'The drop in weekly case growth from 22% to 3% after the campaign began.', 'The total number of people vaccinated.', 'Cases were tracked using state health records.'], correctIndex: 1, explanation: 'The sharp drop in weekly growth rate (22% to 3%) is the direct quantitative evidence of the campaign\'s effect.' }
        ],
        'Words in Context': [
            { prompt: "Although the committee's report was thorough, its conclusions were so ______ that readers left with more questions than answers.\n\nWhich choice completes the text with the most logical and precise word?", choices: ['definitive', 'equivocal', 'exhaustive', 'unanimous'], correctIndex: 1, explanation: '"More questions than answers" signals vague, noncommittal conclusions — "equivocal" fits, while "definitive" and "unanimous" mean roughly the opposite.' },
            { prompt: "The senator's speech was praised for its ______ tone, striking a balance between firmness and warmth that neither alienated critics nor pandered to supporters.\n\nWhich choice completes the text with the most logical and precise word?", choices: ['volatile', 'measured', 'apathetic', 'hostile'], correctIndex: 1, explanation: '"Balance between firmness and warmth" describes a controlled, "measured" tone; the other options suggest instability or disengagement.' },
            { prompt: "Despite the drug's promising early trials, regulators remained ______, demanding years of additional data before approval.\n\nWhich choice completes the text with the most logical and precise word?", choices: ['circumspect', 'enthusiastic', 'indifferent', 'reckless'], correctIndex: 0, explanation: 'Demanding more data despite promising results shows caution — "circumspect" fits, while "enthusiastic" and "reckless" contradict that caution.' },
            { prompt: "The critic's review was far from ______; nearly every paragraph identified a flaw in the film's pacing, dialogue, or acting.\n\nWhich choice completes the text with the most logical and precise word?", choices: ['scathing', 'flattering', 'ambiguous', 'brief'], correctIndex: 1, explanation: 'A review listing flaws in nearly every paragraph is the opposite of "flattering," which the phrase "far from" is negating.' },
            { prompt: "The negotiators reached a ______ agreement, one that neither side fully embraced but both were willing to accept to end the standoff.\n\nWhich choice completes the text with the most logical and precise word?", choices: ['triumphant', 'provisional', 'grudging', 'unanimous'], correctIndex: 2, explanation: '"Neither side fully embraced" but "willing to accept" describes reluctant acceptance — "grudging" captures that precisely.' }
        ],
        'Text Structure and Purpose': [
            { prompt: "The author opens the essay by describing a personal experience of getting lost while hiking, before pivoting to a broader discussion of how humans navigate uncertainty.\n\nWhy does the author most likely begin with the personal anecdote?", choices: ['To prove that hiking is a dangerous activity.', 'To provide a relatable, concrete entry point into an abstract topic.', 'To criticize inexperienced hikers.', 'To explain the history of trail markers.'], correctIndex: 1, explanation: 'Opening with a relatable anecdote before broadening to an abstract theme is a common structural move to draw readers in.' },
            { prompt: "In the passage, the writer spends the first two paragraphs detailing the failures of previous attempts to farm the crop before explaining the innovation that finally succeeded.\n\nWhat is the most likely purpose of detailing the earlier failures?", choices: ['To argue that the crop should not be farmed at all.', 'To highlight, by contrast, how significant the eventual innovation was.', 'To criticize the farmers who failed.', 'To provide unrelated historical background.'], correctIndex: 1, explanation: 'Detailing failures right before revealing the successful innovation sets up a contrast that emphasizes the innovation\'s significance.' },
            { prompt: "The passage's final paragraph shifts from describing the artist's technique to speculating about how future historians might interpret her work.\n\nWhy does the author most likely include this shift?", choices: ['To undermine the credibility of the artist.', 'To broaden the discussion beyond the artist\'s own lifetime.', 'To correct an error made earlier in the passage.', 'To summarize the artist\'s biography.'], correctIndex: 1, explanation: 'Moving from technique to future interpretation extends the discussion\'s scope beyond the present.' },
            { prompt: "Midway through the article, the author interrupts the discussion of climate policy to explain a basic scientific concept before returning to the policy debate.\n\nWhat is the most likely purpose of this interruption?", choices: ['To distract readers from the main argument.', 'To equip readers with background needed to follow the policy discussion.', 'To argue that the science is unsettled.', 'To end the article early.'], correctIndex: 1, explanation: 'Pausing to explain a concept before returning to the main discussion typically gives readers necessary context.' },
            { prompt: "The author devotes the opening paragraph to praising the CEO's early achievements before spending the rest of the article detailing the company's recent controversies.\n\nWhat is the likely function of the opening praise?", choices: ['To argue that the controversies are exaggerated.', 'To establish a contrast that makes the later controversies more striking.', 'To apologize on behalf of the CEO.', 'To provide unrelated financial data.'], correctIndex: 1, explanation: 'Praise followed by a pivot to controversy is a structural contrast used to heighten the impact of what follows.' }
        ],
        'Cross-Text Connections': [
            { prompt: "Text 1 argues that social media has strengthened civic engagement by making political organizing easier. Text 2 argues that social media has weakened civic engagement by replacing sustained activism with passive \"clicktivism.\"\n\nHow would the author of Text 2 most likely respond to Text 1's claim?", choices: ['By agreeing that organizing has become easier and more effective.', 'By arguing that easier organizing does not necessarily translate into meaningful, sustained engagement.', 'By stating that social media has no effect on civic engagement.', 'By praising Text 1\'s use of statistics.'], correctIndex: 1, explanation: 'Text 2\'s clicktivism argument directly challenges the assumption that ease of organizing equals real engagement.' },
            { prompt: "Text 1 claims that a plant-based diet is the most environmentally sustainable choice for individuals. Text 2 claims that sustainability depends more on how food is produced than on whether it is plant- or animal-based.\n\nHow does Text 2 most likely relate to Text 1?", choices: ['Text 2 fully supports Text 1\'s conclusion.', 'Text 2 complicates Text 1\'s conclusion by introducing production method as a competing factor.', 'Text 2 ignores the topic of sustainability entirely.', 'Text 2 argues that diet has no effect on the environment.'], correctIndex: 1, explanation: 'Text 2 doesn\'t flatly deny Text 1 but adds a factor — production method — that complicates its simple diet-based conclusion.' },
            { prompt: "Text 1 attributes the decline of a town's downtown shops to the rise of online retail. Text 2 attributes the same decline to a lack of affordable parking downtown.\n\nWhich choice best describes the relationship between the two texts?", choices: ['The texts offer competing explanations for the same phenomenon.', 'The texts describe two unrelated events.', 'Text 2 confirms Text 1\'s explanation exactly.', 'Text 1 argues that the shops never declined.'], correctIndex: 0, explanation: 'Both texts explain the same decline but point to different causes, making them competing explanations.' },
            { prompt: "Text 1 suggests ancient ruins were used as a religious site based on ceremonial artifacts found there. Text 2 suggests the same ruins were a marketplace based on scales and coin molds found nearby.\n\nHow would the author of Text 1 most likely respond to Text 2's evidence?", choices: ['By conceding the site was never used by ancient people.', 'By arguing the ceremonial artifacts still suggest religious use, even if the site had other functions too.', 'By dismissing archaeology as an unreliable field.', 'By agreeing entirely with Text 2\'s interpretation.'], correctIndex: 1, explanation: 'A reasonable response from Text 1\'s author would defend the religious interpretation without necessarily denying the marketplace evidence.' },
            { prompt: "Text 1 argues that a four-day work week increases employee productivity. Text 2 argues that any productivity gains from a four-day week disappear once overtime and scheduling costs are factored in.\n\nWhat would the author of Text 2 most likely say about Text 1's findings?", choices: ['That they may be accurate but incomplete without considering added costs.', 'That they are completely fabricated.', 'That employee productivity is impossible to measure.', 'That a four-day week should be extended to five days.'], correctIndex: 0, explanation: 'Text 2\'s argument is about hidden costs, not the accuracy of Text 1\'s productivity data, so it would most likely call the finding incomplete rather than wrong.' }
        ],
        'Rhetorical Synthesis': [
            { prompt: "Notes:\n• The library extended its hours in 2019.\n• Visitor numbers rose from 400/week to 650/week.\n• The extension cost the city $40,000 annually.\n\nGoal: The student wants to emphasize the effectiveness of the extended hours. Which choice most effectively uses relevant information from the notes to accomplish this goal?", choices: ['The library extended its hours in 2019, and the extension cost $40,000 annually.', 'After the library extended its hours in 2019, weekly visitors rose from 400 to 650.', 'The library extended its hours in 2019 at a cost of $40,000 to the city.', 'In 2019, several changes were made to the library\'s operations.'], correctIndex: 1, explanation: 'Only this choice connects the extended hours directly to the numeric increase in visitors, which demonstrates effectiveness.' },
            { prompt: "Notes:\n• The chef trained in France for six years.\n• She opened her first restaurant in 2015.\n• Her restaurant received a national award in 2021.\n\nGoal: The student wants to highlight the chef's formal training as a foundation for her later success. Which choice most effectively uses relevant information from the notes to accomplish this goal?", choices: ['The chef opened her restaurant in 2015 and won an award in 2021.', 'After six years of training in France, the chef opened a restaurant that would go on to win a national award.', 'The chef\'s restaurant received a national award in 2021.', 'France is known for its culinary training programs.'], correctIndex: 1, explanation: 'Only this choice links the French training directly to the restaurant\'s eventual award, framing training as the foundation for success.' },
            { prompt: "Notes:\n• The bridge was built in 1932.\n• It was designed to hold 10,000 vehicles per day.\n• By 2020, it carried over 45,000 vehicles per day.\n\nGoal: The student wants to illustrate how much traffic demand has exceeded the bridge's original capacity. Which choice most effectively uses relevant information from the notes to accomplish this goal?", choices: ['The bridge was built in 1932 and is still in use today.', 'Originally designed for 10,000 vehicles per day, the bridge now carries more than 45,000.', 'The bridge carries vehicles across the river every day.', 'Bridges built in the 1930s used different engineering standards.'], correctIndex: 1, explanation: 'Only this choice states both the original capacity and the current volume, directly illustrating the gap the goal describes.' },
            { prompt: "Notes:\n• The startup launched an app in 2020.\n• The app had 500 users in its first month.\n• By 2023, the app had 2 million users.\n\nGoal: The student wants to emphasize the app's rapid growth. Which choice most effectively uses relevant information from the notes to accomplish this goal?", choices: ['The startup launched an app in 2020.', 'The app grew from 500 users in its first month to 2 million users by 2023.', 'The app was launched by a startup in 2020 and is still available today.', 'Many startups launch apps to attract users.'], correctIndex: 1, explanation: 'Only this choice presents the numeric growth from 500 to 2 million, directly showing rapid growth.' },
            { prompt: "Notes:\n• The garden was replanted with native species in 2018.\n• Water usage dropped by 60%.\n• Local bird sightings increased noticeably.\n\nGoal: The student wants to describe two specific benefits that resulted from replanting with native species. Which choice most effectively uses relevant information from the notes to accomplish this goal?", choices: ['The garden was replanted with native species in 2018.', 'After the garden was replanted with native species, water usage dropped by 60% and bird sightings increased.', 'Native species require different care than non-native plants.', 'Gardens can be replanted at any time of year.'], correctIndex: 1, explanation: 'Only this choice names two specific, measurable benefits — reduced water use and increased bird sightings — tied to the replanting.' }
        ],
        'Transitions': [
            { prompt: "The bakery's ovens broke down twice in one week. ______, the owner decided to replace them entirely rather than repair them again.\n\nWhich choice completes the text with the most logical transition?", choices: ['For example,', 'Consequently,', 'In contrast,', 'Similarly,'], correctIndex: 1, explanation: 'The second sentence is a direct result of the first, so "Consequently" (cause-effect) fits, not contrast or example.' },
            { prompt: "Many economists predicted the policy would raise inflation. ______, inflation actually fell in the two years following its implementation.\n\nWhich choice completes the text with the most logical transition?", choices: ['Similarly,', 'Therefore,', 'In fact,', 'Instead,'], correctIndex: 3, explanation: 'The second sentence contradicts the prediction, so "Instead" (contrast) is correct; "therefore" and "similarly" wrongly suggest agreement.' },
            { prompt: "The novel's plot is widely praised for its originality. ______, critics have noted that its characters feel underdeveloped.\n\nWhich choice completes the text with the most logical transition?", choices: ['Nonetheless,', 'As a result,', 'For instance,', 'In addition,'], correctIndex: 0, explanation: 'There is a contrast between the praised plot and the criticized characters, so "Nonetheless" fits; "as a result" wrongly implies causation.' },
            { prompt: "The trail was closed due to flooding last spring. ______, park officials reopened it after installing new drainage systems.\n\nWhich choice completes the text with the most logical transition?", choices: ['Similarly,', 'Subsequently,', 'However,', 'For example,'], correctIndex: 1, explanation: 'The reopening happened after the closure in a sequence of events, so "Subsequently" (sequence) fits better than "however" (contrast).' },
            { prompt: "The committee reviewed dozens of proposals over three months. ______, they selected the plan that required the smallest budget increase.\n\nWhich choice completes the text with the most logical transition?", choices: ['Ultimately,', 'Conversely,', 'For example,', 'Similarly,'], correctIndex: 0, explanation: '"Ultimately" signals the final outcome of a lengthy review process; the other options don\'t fit a concluding result.' }
        ],
        'Boundaries': [
            { prompt: "The committee reviewed the ______ then rejected it unanimously.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['proposal, then', 'proposal, and then', 'proposal and then', 'proposal; and then'], correctIndex: 2, explanation: '"Reviewed the proposal" and "rejected it" share the same subject ("the committee"), making this a compound predicate, not two independent clauses — no comma is needed before "and."' },
            { prompt: "The rain finally ______ the game resumed after a two-hour delay.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['stopped, the', 'stopped, and the', 'stopped the', 'stopped; and the'], correctIndex: 1, explanation: '"The rain finally stopped" and "the game resumed" are both independent clauses, so they need a comma plus a coordinating conjunction ("and") — not a comma splice, a run-on, or a semicolon followed by "and."' },
            { prompt: "Maria's presentation covered three ______ market trends, pricing strategy, and customer feedback.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['topics,', 'topics:', 'topics;', 'topics —and'], correctIndex: 1, explanation: 'A colon correctly introduces the list that explains "three topics," and it is preceded by a complete independent clause.' },
            { prompt: "The museum's new wing ______ opens to the public next month.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: [', funded entirely by private donors,', 'funded entirely by private donors', '; funded entirely by private donors;', ', funded entirely by private donors'], correctIndex: 0, explanation: '"Funded entirely by private donors" is a nonessential interrupting phrase and needs a comma on both sides to set it off from the main clause.' },
            { prompt: "The report's conclusion was ______ sales would continue to decline without immediate changes.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['clear,', 'clear:', 'clear;', 'clear and'], correctIndex: 1, explanation: 'A colon introduces an explanation of what came before ("the report\'s conclusion"), and the clause before it is complete, so the colon is correct.' }
        ],
        'Form, Structure, and Sense': [
            { prompt: "The collection of essays, compiled over three decades by researchers from five countries, ______ widely regarded as the definitive work on the subject.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['are', 'is', 'were', 'have been'], correctIndex: 1, explanation: 'The subject is the singular "collection" — not the plural "researchers" or "countries" inside the interrupting phrase — so it takes the singular verb "is."' },
            { prompt: "Each of the applicants ______ required to submit three letters of recommendation.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['are', 'is', 'were', 'have been'], correctIndex: 1, explanation: '"Each" is singular, regardless of the plural noun "applicants" that follows it, so it takes the singular verb "is."' },
            { prompt: "By the time the plane finally landed, the passengers ______ waiting on the tarmac for over three hours.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['had been', 'have been', 'are', 'will be'], correctIndex: 0, explanation: '"By the time" signals an action completed before another past action (landing), which requires the past perfect "had been."' },
            { prompt: "Neither the coach nor the players ______ satisfied with the referee's decision.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['was', 'were', 'is', 'has been'], correctIndex: 1, explanation: 'In a "neither...nor" construction, the verb agrees with the closer subject — here, the plural "players" — so "were" is correct.' },
            { prompt: "The company's new headquarters, along with its three regional offices, ______ set to open by early next year.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?", choices: ['are', 'is', 'were', 'have been'], correctIndex: 1, explanation: '"Along with its three regional offices" is a nonessential phrase, not part of the subject. The true subject is the singular "headquarters" (one building complex), so it takes "is."' }
        ]
    };
    const RW_BANK = {};
    Object.entries(RW_BANK_DEFS).forEach(([label, items]) => {
        RW_BANK[T.skillKey(label)] = items;
    });

    /* ══════════════════════════════════════════════════════════
       Public API
    ══════════════════════════════════════════════════════════ */

    function allSkills() {
        return T.SKILLS.map(s => ({
            key: s.key, label: s.label, section: s.section, domain: s.domain,
            kind: MATH_GEN[s.key] ? 'generated' : 'bank',
            poolSize: MATH_GEN[s.key] ? Infinity : (RW_BANK[s.key] || []).length
        }));
    }

    function hasSkill(key) { return !!(MATH_GEN[key] || RW_BANK[key]); }

    /* Returns { skillKey, skillLabel, section, domain, questions, repeated } */
    function generateQuiz(skillKey, count, rng = Math.random) {
        const skill = T.skill(skillKey);
        const label = skill ? skill.label : skillKey;
        const section = skill ? skill.section : 'rw';
        const domain = skill ? skill.domain : null;

        if (MATH_GEN[skillKey]) {
            const gen = MATH_GEN[skillKey];
            const questions = [];
            for (let i = 0; i < count; i++) questions.push(gen(rng));
            return { skillKey, skillLabel: label, section, domain, questions, repeated: false };
        }

        const pool = RW_BANK[skillKey] || [];
        if (pool.length === 0) return { skillKey, skillLabel: label, section, domain, questions: [], repeated: false };

        const questions = [];
        let repeated = false;
        while (questions.length < count) {
            if (questions.length >= pool.length) repeated = true;
            const lap = shuffle(rng, pool);
            for (const q of lap) {
                if (questions.length >= count) break;
                questions.push(q);
            }
        }
        return { skillKey, skillLabel: label, section, domain, questions, repeated };
    }

    return { allSkills, hasSkill, generateQuiz };
})();
