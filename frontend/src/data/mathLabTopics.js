// ─────────────────────────────────────────────────────────────────────────────
// 3D Math Lab — curriculum topics & problem bank
//
// Every topic maps 1:1 to a planet in the Learning Universe, so a student can
// pick a topic there (or in the lab itself) and land in the matching lab.
//
// Problem shape:
//   display  : tokens rendered above the visualiser ({left, op, right})
//   viz      : drives the animated 3D visualiser
//                bars   -> 3D fraction bars
//                hops   -> number line jumps
//                ladder -> LCM / common-denominator ladder
//                balance-> algebra balance scale
//                flip   -> reciprocal flip cards
//                steps  -> step-by-step reveal
// ─────────────────────────────────────────────────────────────────────────────

export const LAB_TOPICS = [
  {
    id: 'c0',
    name_en: 'Integers',
    name_te: 'పూర్ణాంకాలు',
    subtitle: 'Directed numbers',
    blurb_en: 'Step left and right on a number line to master signed addition and subtraction.',
    blurb_te: 'సంఖ్యా రేఖపై ఎడమ-కుడు కదులుతూ ధన, రుణ సంఖ్యల కూడిక-తీసివేత నేర్చుకోండి.',
    icon: '↔',
    color: '#00f2fe',
    accent: '#38bdf8',
    level: 'Foundation',
    problems: [
      {
        id: 'c0p1',
        stem_en: '(-5) + 3 = ?',
        stem_te: '(-5) + 3 = ?',
        display: { left: '(-5)', op: '+', right: '3' },
        answer: '-2',
        options: ['-2', '-8', '2', '8'],
        difficulty: 1,
        hints: [
          'Start at zero on the number line.',
          'Move 5 steps left for -5, then 3 steps right for +3.',
          'You land on -2, so (-5) + 3 = -2.'
        ],
        aiPrompt: '"Start at 0. Which way do you move first for -5?"',
        aiWrong: '"Not yet. A negative number moves you left; a positive moves you right. Count the jumps again."',
        aiRight: '"Exactly! 5 left, then 3 right lands you on -2."',
        viz: {
          value: -2,
          start: 0,
          hops: [
            { delta: -5, label: '-5' },
            { delta: 3, label: '+3' }
          ],
          steps: [
            'Start at 0 on the number line.',
            'Move 5 units left to reach -5.',
            'Move 3 units right from -5.',
            'You land on -2. So (-5) + 3 = -2.'
          ]
        }
      },
      {
        id: 'c0p2',
        stem_en: '(-4) - (-6) = ?',
        stem_te: '(-4) - (-6) = ?',
        display: { left: '(-4)', op: '-', right: '(-6)' },
        answer: '2',
        options: ['2', '-2', '10', '-10'],
        difficulty: 2,
        hints: [
          'Subtracting a negative is the same as adding.',
          'So (-4) - (-6) becomes (-4) + 6.',
          'Move 4 left, then 6 right. You land on 2.'
        ],
        aiPrompt: '"Watch the double negative: what does subtracting -6 actually do?"',
        aiWrong: '"Remember: a - (-b) = a + b. So -6 being subtracted becomes +6."',
        aiRight: '"Correct! (-4) + 6 = 2. The two minus signs cancel."',
        viz: {
          value: 2,
          start: 0,
          hops: [
            { delta: -4, label: '-4' },
            { delta: 6, label: '+6' }
          ],
          steps: [
            'Rewrite the double negative: (-4) - (-6) = (-4) + 6.',
            'Start at 0 and move 4 units left to -4.',
            'Move 6 units right from -4.',
            'You land on 2.'
          ]
        }
      },
      {
        id: 'c0p3',
        stem_en: '(-3) x 4 = ?',
        stem_te: '(-3) x 4 = ?',
        display: { left: '(-3)', op: 'x', right: '4' },
        answer: '-12',
        options: ['-12', '12', '-7', '7'],
        difficulty: 2,
        hints: [
          'Multiplying by 4 means adding -3 four times.',
          '(-3) + (-3) + (-3) + (-3).',
          'Four jumps of 3 to the left land on -12.'
        ],
        aiPrompt: '"Multiplication is repeated addition. How many jumps of -3 do you need?"',
        aiWrong: '"4 groups of -3 means four jumps to the left, not one jump of 7."',
        aiRight: '"Yes! Four jumps of -3 land on -12."',
        viz: {
          value: -12,
          start: 0,
          hops: [
            { delta: -3, label: '-3' },
            { delta: -3, label: '-3' },
            { delta: -3, label: '-3' },
            { delta: -3, label: '-3' }
          ],
          steps: [
            'Repeated addition: (-3) x 4 = (-3) + (-3) + (-3) + (-3).',
            'Each jump moves 3 units to the left.',
            'After 4 jumps you are 12 units left of zero.',
            'So (-3) x 4 = -12.'
          ]
        }
      },
      {
        id: 'c0p4',
        stem_en: '(-7) + 9 = ?',
        stem_te: '(-7) + 9 = ?',
        display: { left: '(-7)', op: '+', right: '9' },
        answer: '2',
        options: ['2', '-2', '16', '-16'],
        difficulty: 1,
        hints: [
          'The jumps point in opposite directions.',
          'Move 7 left, then 9 right — the right jump is longer.',
          'You overshoot zero by 2, so the answer is +2.'
        ],
        aiPrompt: '"Which jump is longer, the one left or the one right?"',
        aiWrong: '"Add the sizes and keep the sign of the larger jump: 9 - 7 = 2, positive."',
        aiRight: '"Nice! 9 right beats 7 left, so you finish at +2."',
        viz: {
          value: 2,
          start: 0,
          hops: [
            { delta: -7, label: '-7' },
            { delta: 9, label: '+9' }
          ],
          steps: [
            'Start at 0 and move 7 units left to -7.',
            'Move 9 units right from -7.',
            'You pass zero and stop 2 units to the right.',
            'So (-7) + 9 = 2.'
          ]
        }
      }
    ]
  },

  {
    id: 'c1',
    name_en: 'Fractions',
    name_te: 'భిన్నాలు',
    subtitle: 'Equivalent forms',
    blurb_en: 'Split a whole into equal parts and find fractions that describe the same amount.',
    blurb_te: 'ఒక పూర్ణాన్ని సమాన భాగాలుగా విభజించి, ఒకే మొత్తాన్ని సూచించే భిన్నాలు కనుగొనండి.',
    icon: '◍',
    color: '#8a4bff',
    accent: '#c084fc',
    level: 'Foundation',
    problems: [
      {
        id: 'c1p1',
        stem_en: '1/2 = ?/8',
        stem_te: '1/2 = ?/8',
        display: { left: '1/2', op: '=', right: '?/8' },
        answer: '4/8',
        options: ['4/8', '2/8', '3/8', '6/8'],
        difficulty: 1,
        hints: [
          'The denominator changed from 2 to 8 — how many times bigger is it?',
          '8 / 2 = 4, so each half is cut into 4 pieces.',
          'Multiply the numerator by the same 4: 1 x 4 = 4, giving 4/8.'
        ],
        aiPrompt: '"How many eighths fit inside one half? Count the slices."',
        aiWrong: '"Whatever you multiply the denominator by, you must multiply the numerator by too."',
        aiRight: '"Exactly! 1/2 = 4/8 — the same amount, cut into more pieces."',
        viz: {
          value: 0.5,
          bars: [
            { num: 1, den: 2, label: '1/2', tone: 'pos' },
            { num: 4, den: 8, label: '4/8', tone: 'pos' }
          ],
          steps: [
            'The whole is split into 2 equal parts and 1 is shaded: 1/2.',
            'Split every part into 4 smaller pieces: the denominator becomes 8.',
            'The shaded region still covers 4 of those 8 pieces.',
            'So 1/2 = 4/8.'
          ]
        }
      },
      {
        id: 'c1p2',
        stem_en: '3/4 = ?/12',
        stem_te: '3/4 = ?/12',
        display: { left: '3/4', op: '=', right: '?/12' },
        answer: '9/12',
        options: ['9/12', '6/12', '8/12', '3/12'],
        difficulty: 1,
        hints: [
          '12 / 4 = 3, so every quarter becomes 3 twelfths.',
          'Multiply the numerator by the same factor: 3 x 3 = 9.',
          'So 3/4 = 9/12.'
        ],
        aiPrompt: '"If 1/4 = 3/12, what is 3 lots of that?"',
        aiWrong: '"The scale factor is 3 (because 4 x 3 = 12), so multiply the top by 3 as well."',
        aiRight: '"Correct! 3/4 = 9/12."',
        viz: {
          value: 0.75,
          bars: [
            { num: 3, den: 4, label: '3/4', tone: 'pos' },
            { num: 9, den: 12, label: '9/12', tone: 'pos' }
          ],
          steps: [
            'Start with 3 shaded parts out of 4.',
            'Cut each quarter into 3 pieces, so there are 12 pieces in total.',
            'The shaded region now covers 3 x 3 = 9 pieces.',
            'So 3/4 = 9/12.'
          ]
        }
      },
      {
        id: 'c1p3',
        stem_en: '6/8 = ?/4',
        stem_te: '6/8 = ?/4',
        display: { left: '6/8', op: '=', right: '?/4' },
        answer: '3/4',
        options: ['3/4', '4/4', '2/4', '6/4'],
        difficulty: 2,
        hints: [
          'This time the denominator gets smaller: 8 → 4.',
          '8 / 4 = 2, so pairs of eighths merge into one quarter.',
          'Divide the numerator by 2: 6 / 2 = 3, giving 3/4.'
        ],
        aiPrompt: '"Two eighths make one quarter. How many quarters are hiding in 6/8?"',
        aiWrong: '"When the denominator halves, the numerator must halve too."',
        aiRight: '"Yes! 6/8 simplifies to 3/4."',
        viz: {
          value: 0.75,
          bars: [
            { num: 6, den: 8, label: '6/8', tone: 'pos' },
            { num: 3, den: 4, label: '3/4', tone: 'pos' }
          ],
          steps: [
            '6 out of 8 parts are shaded.',
            'Every pair of eighths joins into one quarter.',
            '6 pieces become 3 quarters.',
            'So 6/8 = 3/4.'
          ]
        }
      },
      {
        id: 'c1p4',
        stem_en: '1/4 = ?/12',
        stem_te: '1/4 = ?/12',
        display: { left: '1/4', op: '=', right: '?/12' },
        answer: '3/12',
        options: ['3/12', '4/12', '2/12', '6/12'],
        difficulty: 1,
        hints: [
          '12 / 4 = 3.',
          'Cut each quarter into 3 equal pieces.',
          'One quarter becomes 3 twelfths.'
        ],
        aiPrompt: '"How many twelfths are inside a single quarter?"',
        aiWrong: '"Scale factor is 3, so multiply the numerator by 3."',
        aiRight: '"Right! 1/4 = 3/12."',
        viz: {
          value: 0.25,
          bars: [
            { num: 1, den: 4, label: '1/4', tone: 'pos' },
            { num: 3, den: 12, label: '3/12', tone: 'pos' }
          ],
          steps: [
            'One quarter of the whole is shaded.',
            'Cut the whole into 12 equal pieces instead.',
            'The same shaded region covers 3 of them.',
            'So 1/4 = 3/12.'
          ]
        }
      }
    ]
  },

  {
    id: 'c2',
    name_en: 'LCM',
    name_te: 'క.సా.గు',
    subtitle: 'Common denominators',
    blurb_en: 'Find the least common multiple so fractions with different denominators can talk to each other.',
    blurb_te: 'వేర్వేరు హారాలను సమానం చేయడానికి కనిష్ఠ సామాన్య గుణిజాన్ని కనుగొనండి.',
    icon: '⋮⋮',
    color: '#0ea5e9',
    accent: '#67e8f9',
    level: 'Building',
    problems: [
      {
        id: 'c2p1',
        stem_en: 'LCM(4, 6) = ?',
        stem_te: 'LCM(4, 6) = ?',
        display: { left: '4', op: '&', right: '6' },
        answer: '12',
        options: ['12', '24', '2', '10'],
        difficulty: 1,
        hints: [
          'List the multiples of 4: 4, 8, 12, 16, ...',
          'List the multiples of 6: 6, 12, 18, 24, ...',
          'The first number in both lists is 12.'
        ],
        aiPrompt: '"Which number appears first in both the 4 and 6 times tables?"',
        aiWrong: '"24 is a common multiple, but the Least Common Multiple is the smallest one."',
        aiRight: '"Correct — 12 is the first shared multiple."',
        viz: {
          value: 12,
          ladder: { a: 4, b: 6, lcm: 12, conversions: [] },
          steps: [
            'Multiples of 4: 4, 8, 12, 16, 20 ...',
            'Multiples of 6: 6, 12, 18, 24 ...',
            'The first value in both lists is 12.',
            'So LCM(4, 6) = 12.'
          ]
        }
      },
      {
        id: 'c2p2',
        stem_en: 'LCM(3, 5) = ?',
        stem_te: 'LCM(3, 5) = ?',
        display: { left: '3', op: '&', right: '5' },
        answer: '15',
        options: ['15', '8', '30', '10'],
        difficulty: 1,
        hints: [
          '3 and 5 share no factor other than 1.',
          'When numbers are coprime, the LCM is their product.',
          '3 x 5 = 15.'
        ],
        aiPrompt: '"Do 3 and 5 share any factor besides 1?"',
        aiWrong: '"Adding the numbers is not the same as finding a common multiple."',
        aiRight: '"Yes! 3 x 5 = 15 because they share no common factor."',
        viz: {
          value: 15,
          ladder: { a: 3, b: 5, lcm: 15, conversions: [] },
          steps: [
            'Multiples of 3: 3, 6, 9, 12, 15 ...',
            'Multiples of 5: 5, 10, 15, 20 ...',
            'The first shared value is 15.',
            'So LCM(3, 5) = 15.'
          ]
        }
      },
      {
        id: 'c2p3',
        stem_en: 'LCM(6, 8) = ?',
        stem_te: 'LCM(6, 8) = ?',
        display: { left: '6', op: '&', right: '8' },
        answer: '24',
        options: ['24', '48', '14', '16'],
        difficulty: 2,
        hints: [
          'Multiples of 6: 6, 12, 18, 24, ...',
          'Multiples of 8: 8, 16, 24, ...',
          'The first shared value is 24.'
        ],
        aiPrompt: '"List the 6 and 8 times tables until something matches."',
        aiWrong: '"48 is common but it is not the least one — 24 comes first."',
        aiRight: '"Great — 24 is the smallest shared multiple."',
        viz: {
          value: 24,
          ladder: { a: 6, b: 8, lcm: 24, conversions: [] },
          steps: [
            'Multiples of 6: 6, 12, 18, 24 ...',
            'Multiples of 8: 8, 16, 24 ...',
            'The first shared value is 24.',
            'So LCM(6, 8) = 24.'
          ]
        }
      },
      {
        id: 'c2p4',
        stem_en: '1/4 + 1/6 needs which denominator?',
        stem_te: '1/4 + 1/6 కు ఏ హారం కావాలి?',
        display: { left: '1/4', op: '+', right: '1/6' },
        answer: '12',
        options: ['12', '10', '24', '6'],
        difficulty: 2,
        hints: [
          'You cannot add quarters and sixths directly.',
          'Find LCM(4, 6) to create equal-sized pieces.',
          'LCM(4, 6) = 12, so use twelfths.'
        ],
        aiPrompt: '"Quarters and sixths are different-sized pieces. What size works for both?"',
        aiWrong: '"The common denominator is the LCM of 4 and 6, and the LCM is the smallest one."',
        aiRight: '"Exactly! Use twelfths: 1/4 = 3/12 and 1/6 = 2/12."',
        viz: {
          value: 12,
          ladder: {
            a: 4,
            b: 6,
            lcm: 12,
            conversions: [
              { from: '1/4', factor: 3, to: '3/12' },
              { from: '1/6', factor: 2, to: '2/12' }
            ]
          },
          steps: [
            'Denominators 4 and 6 are different, so the pieces do not match.',
            'LCM(4, 6) = 12, so both fractions can be written in twelfths.',
            '1/4 = 3/12 and 1/6 = 2/12.',
            'The common denominator is 12.'
          ]
        }
      }
    ]
  },

  {
    id: 'c5',
    name_en: 'Rational Numbers',
    name_te: 'అకరణీయ సంఖ్యలు',
    subtitle: 'All four operations',
    blurb_en: 'Add, subtract, multiply and divide signed fractions with unlike denominators.',
    blurb_te: 'వేర్వేరు హారాలతో రుణ గుర్తులు గల భిన్నాలను కూడడం, తీసివేయడం, గుణించడం, భాగించడం.',
    icon: '🪐',
    color: '#3b82f6',
    accent: '#00e5ff',
    level: 'Core',
    problems: [
      {
        id: 'c5p1',
        stem_en: '(-3/4) + 1/2 = ?',
        stem_te: '(-3/4) + 1/2 = ?',
        display: { left: '-3/4', op: '+', right: '1/2' },
        answer: '-1/4',
        options: ['-1/4', '-1/3', '5/4', '1/4'],
        difficulty: 2,
        hints: [
          'Before adding, denominators must be equal.',
          'The LCM of 4 and 2 is 4. Convert 1/2 to 2/4.',
          'Now compute: -3/4 + 2/4. Add the numerators: -3 + 2 = -1.',
          'Full solution: -3/4 + 2/4 = (-3+2)/4 = -1/4.'
        ],
        hints_te: [
          'కూడటానికి ముందు హారాలు సమానంగా ఉండాలి.',
          '4 మరియు 2 ల క.సా.గు = 4. 1/2 → 2/4 గా మార్చండి.',
          'ఇప్పుడు లెక్కించండి: -3/4 + 2/4. లవాలు కూడండి: -3 + 2 = -1.',
          'పూర్తి పరిష్కారం: -3/4 + 2/4 = -1/4.'
        ],
        aiPrompt: '"Can you solve -3/4 + 1/2? Think about what happens when denominators are different."',
        aiWrong: '"Not quite! The pieces are different sizes. Equalise the denominators using the LCM before adding."',
        aiRight: '"Great job! 1/2 = 2/4, then (-3 + 2)/4 = -1/4."',
        viz: {
          value: -0.25,
          bars: [
            { num: -3, den: 4, label: '-3/4', tone: 'neg' },
            { num: 1, den: 2, label: '1/2', tone: 'pos' }
          ],
          result: { num: -1, den: 4, label: '-1/4' },
          ladder: {
            a: 4,
            b: 2,
            lcm: 4,
            conversions: [{ from: '1/2', factor: 2, to: '2/4' }]
          },
          steps: [
            'Denominators are 4 and 2 — they differ, so convert first.',
            'LCM(4, 2) = 4, so 1/2 = 2/4.',
            'Now add the numerators: -3 + 2 = -1, keeping the denominator 4.',
            'Result: -1/4.'
          ]
        }
      },
      {
        id: 'c5p2',
        stem_en: '(-5/6) + 1/3 = ?',
        stem_te: '(-5/6) + 1/3 = ?',
        display: { left: '-5/6', op: '+', right: '1/3' },
        answer: '-1/2',
        options: ['-1/2', '-4/9', '-7/6', '1/6'],
        difficulty: 2,
        hints: [
          'The denominators 6 and 3 are different — make them equal first.',
          'The LCM of 6 and 3 is 6. Convert 1/3 to 2/6.',
          'Now compute: -5/6 + 2/6. Add the numerators: -5 + 2 = -3.',
          'Full solution: -5/6 + 2/6 = -3/6 = -1/2.'
        ],
        hints_te: [
          'హారాలు 6 మరియు 3 వేర్వేరుగా ఉన్నాయి — ముందు సమానం చేయండి.',
          '6 మరియు 3 ల క.సా.గు = 6. 1/3 → 2/6 గా మార్చండి.',
          'ఇప్పుడు: -5/6 + 2/6. లవాలు కూడండి: -5 + 2 = -3.',
          'పూర్తి పరిష్కారం: -5/6 + 2/6 = -3/6 = -1/2.'
        ],
        aiPrompt: '"Can you find -5/6 + 1/3? Look at the denominators first — are they equal?"',
        aiWrong: '"Remember, you cannot add fractions with different denominators directly. Find LCM(6, 3) first."',
        aiRight: '"Excellent! 1/3 = 2/6, then -5/6 + 2/6 = -3/6 = -1/2."',
        viz: {
          value: -0.5,
          bars: [
            { num: -5, den: 6, label: '-5/6', tone: 'neg' },
            { num: 1, den: 3, label: '1/3', tone: 'pos' }
          ],
          result: { num: -1, den: 2, label: '-1/2' },
          ladder: {
            a: 6,
            b: 3,
            lcm: 6,
            conversions: [{ from: '1/3', factor: 2, to: '2/6' }]
          },
          steps: [
            'Denominators are 6 and 3.',
            'LCM(6, 3) = 6, so 1/3 = 2/6.',
            'Add numerators: -5 + 2 = -3, keeping the denominator 6.',
            '-3/6 simplifies to -1/2.'
          ]
        }
      },
      {
        id: 'c5p3',
        stem_en: '(-2/5) - (-1/5) = ?',
        stem_te: '(-2/5) - (-1/5) = ?',
        display: { left: '-2/5', op: '-', right: '(-1/5)' },
        answer: '-1/5',
        options: ['-1/5', '-3/5', '1/5', '3/5'],
        difficulty: 2,
        hints: [
          'Subtracting a negative is the same as adding: a - (-b) = a + b.',
          'So -2/5 - (-1/5) = -2/5 + 1/5.',
          'The denominators are already equal (both 5). Add numerators: -2 + 1 = -1.',
          'Full solution: -2/5 + 1/5 = -1/5.'
        ],
        hints_te: [
          'రుణ సంఖ్యను తీసివేయడం అంటే కూడటమే: a − (−b) = a + b.',
          'కాబట్టి −2/5 − (−1/5) = −2/5 + 1/5.',
          'హారాలు సమానంగా ఉన్నాయి (రెండూ 5). లవాలు కూడండి: -2 + 1 = -1.',
          'పూర్తి పరిష్కారం: -2/5 + 1/5 = -1/5.'
        ],
        aiPrompt: '"Evaluate -2/5 - (-1/5). Watch the double negative!"',
        aiWrong: '"Minus times minus is plus, so -(-1/5) becomes +1/5."',
        aiRight: '"Brilliant! -2/5 + 1/5 = -1/5."',
        viz: {
          value: -0.2,
          bars: [
            { num: -2, den: 5, label: '-2/5', tone: 'neg' },
            { num: -1, den: 5, label: '-1/5', tone: 'neg' }
          ],
          result: { num: -1, den: 5, label: '-1/5' },
          steps: [
            'Rewrite the double negative: -2/5 - (-1/5) = -2/5 + 1/5.',
            'Both fractions already have denominator 5.',
            'Add the numerators: -2 + 1 = -1.',
            'Result: -1/5.'
          ]
        }
      },
      {
        id: 'c5p4',
        stem_en: '(2/3) / (4/5) = ?',
        stem_te: '(2/3) ÷ (4/5) = ?',
        display: { left: '2/3', op: '/', right: '4/5' },
        answer: '5/6',
        options: ['5/6', '8/15', '6/5', '2/5'],
        difficulty: 3,
        hints: [
          'Division of fractions: multiply by the reciprocal of the divisor.',
          'The reciprocal of 4/5 is 5/4.',
          'Now multiply: 2/3 x 5/4 = (2x5)/(3x4) = 10/12.',
          'Full solution: 10/12 = 5/6.'
        ],
        hints_te: [
          'భిన్నాల భాగహారం: హరణ భిన్నం యొక్క వ్యుత్క్రమంతో గుణించండి.',
          '4/5 యొక్క వ్యుత్క్రమం 5/4.',
          'ఇప్పుడు గుణించండి: 2/3 × 5/4 = 10/12.',
          'పూర్తి పరిష్కారం: 10/12 = 5/6.'
        ],
        aiPrompt: '"Compute (2/3) / (4/5). Dividing by a fraction means multiplying by its reciprocal."',
        aiWrong: '"Flip the second fraction and multiply. What is the reciprocal of 4/5?"',
        aiRight: '"Perfect! 2/3 x 5/4 = 10/12 = 5/6."',
        viz: {
          value: 0.8333,
          flip: { divisor: '4/5', reciprocal: '5/4', product: '2/3 x 5/4 = 10/12 = 5/6' },
          bars: [
            { num: 2, den: 3, label: '2/3', tone: 'pos' },
            { num: 5, den: 4, label: '5/4', tone: 'pos' }
          ],
          result: { num: 5, den: 6, label: '5/6' },
          steps: [
            'Keep the first fraction: 2/3.',
            'Change division to multiplication and flip the divisor: 4/5 becomes 5/4.',
            'Multiply: 2/3 x 5/4 = 10/12.',
            'Simplify by 2: 10/12 = 5/6.'
          ]
        }
      },
      {
        id: 'c5p5',
        stem_en: '(-3/8) + (-5/8) = ?',
        stem_te: '(-3/8) + (-5/8) = ?',
        display: { left: '-3/8', op: '+', right: '-5/8' },
        answer: '-1',
        options: ['-1', '-2/8', '-8/16', '8/64'],
        difficulty: 1,
        hints: [
          'The denominators are already equal (both 8).',
          'Add the numerators: -3 + (-5) = -8.',
          'Result: -8/8. Simplify by dividing top and bottom by 8.',
          'Full solution: -8/8 = -1.'
        ],
        hints_te: [
          'హారాలు ఇప్పటికే సమానంగా ఉన్నాయి (రెండూ 8).',
          'లవాలు కూడండి: -3 + (-5) = -8.',
          'ఫలితం: -8/8. రెండింటినీ 8 చే భాగించండి.',
          'పూర్తి పరిష్కారం: -8/8 = -1.'
        ],
        aiPrompt: '"Find (-3/8) + (-5/8). Same denominators — focus on the numerators."',
        aiWrong: '"The denominators are the same, so just add the numerators: -3 + (-5)."',
        aiRight: '"Excellent! -8/8 = -1."',
        viz: {
          value: -1,
          bars: [
            { num: -3, den: 8, label: '-3/8', tone: 'neg' },
            { num: -5, den: 8, label: '-5/8', tone: 'neg' }
          ],
          result: { num: -1, den: 1, label: '-1' },
          steps: [
            'The denominators are already equal (8).',
            'Add the numerators: -3 + (-5) = -8.',
            'That gives -8/8.',
            'Simplify: -8/8 = -1.'
          ]
        }
      }
    ]
  },

  {
    id: 'c7',
    name_en: 'Algebra',
    name_te: 'బీజగణితం',
    subtitle: 'Balance & equations',
    blurb_en: 'Keep both sides of an equation balanced while you undo operations to isolate x.',
    blurb_te: 'సమీకరణం రెండు వైపులా సమతుల్యంగా ఉంచుతూ x ను వేరు చేయండి.',
    icon: 'x + 3',
    color: '#d946ef',
    accent: '#f472b6',
    level: 'Challenge',
    problems: [
      {
        id: 'c7p1',
        stem_en: 'x + 3 = 7, so x = ?',
        stem_te: 'x + 3 = 7 అయితే x = ?',
        display: { left: 'x + 3', op: '=', right: '7' },
        answer: '4',
        options: ['4', '10', '7', '3'],
        difficulty: 1,
        hints: [
          'The left side has 3 extra units compared to x alone.',
          'Undo the +3 by subtracting 3 from both sides.',
          'x + 3 - 3 = 7 - 3, so x = 4.'
        ],
        aiPrompt: '"What operation would remove the +3 from x + 3?"',
        aiWrong: '"Do the inverse operation on both sides. Adding 3 to 7 is not undoing it."',
        aiRight: '"Exactly! Subtract 3 from both sides: x = 4."',
        viz: {
          value: 4,
          balance: { left: 'x + 3', right: '7', unknown: 'x = 4', tilt: -11 },
          inverse: [
            { op: '- 3', note: 'Subtract 3 from both sides to undo +3' },
            { op: 'x = 4', note: 'The scale is balanced' }
          ],
          steps: [
            'The equation says x + 3 balances 7.',
            'Subtract 3 from both sides to keep it balanced.',
            'x + 3 - 3 = 7 - 3.',
            'So x = 4.'
          ]
        }
      },
      {
        id: 'c7p2',
        stem_en: '2x = 10, so x = ?',
        stem_te: '2x = 10 అయితే x = ?',
        display: { left: '2x', op: '=', right: '10' },
        answer: '5',
        options: ['5', '20', '8', '2'],
        difficulty: 1,
        hints: [
          '2x means 2 identical x-pieces.',
          'Undo multiplication by dividing both sides by 2.',
          'x = 10 / 2 = 5.'
        ],
        aiPrompt: '"If two identical pieces weigh 10, how much is one piece?"',
        aiWrong: '"Same operation on both sides: divide by 2, do not multiply."',
        aiRight: '"Correct! x = 5."',
        viz: {
          value: 5,
          balance: { left: '2x', right: '10', unknown: 'x = 5', tilt: 9 },
          inverse: [
            { op: '/ 2', note: 'Divide both sides by 2 to undo x2' },
            { op: 'x = 5', note: 'The scale is balanced' }
          ],
          steps: [
            'The equation says two x-pieces balance 10.',
            'Divide both sides by 2.',
            '2x / 2 = 10 / 2.',
            'So x = 5.'
          ]
        }
      },
      {
        id: 'c7p3',
        stem_en: '3x - 2 = 7, so x = ?',
        stem_te: '3x - 2 = 7 అయితే x = ?',
        display: { left: '3x - 2', op: '=', right: '7' },
        answer: '3',
        options: ['3', '9', '5', '2'],
        difficulty: 3,
        hints: [
          'Work backwards: first undo the -2.',
          'Add 2 to both sides: 3x = 9.',
          'Then divide both sides by 3: x = 3.'
        ],
        aiPrompt: '"Two operations are acting on x. Which one do you undo first?"',
        aiWrong: '"Reverse the order: add 2 first, then divide by 3."',
        aiRight: '"Yes! 3x = 9, so x = 3."',
        viz: {
          value: 3,
          balance: { left: '3x - 2', right: '7', unknown: 'x = 3', tilt: -7 },
          inverse: [
            { op: '+ 2', note: 'Add 2 to both sides to undo -2' },
            { op: '3x = 9', note: 'Now the equation is simpler' },
            { op: '/ 3', note: 'Divide both sides by 3' },
            { op: 'x = 3', note: 'The scale is balanced' }
          ],
          steps: [
            'Start with 3x - 2 = 7.',
            'Add 2 to both sides: 3x = 9.',
            'Divide both sides by 3.',
            'So x = 3.'
          ]
        }
      },
      {
        id: 'c7p4',
        stem_en: 'x/2 + 1 = 4, so x = ?',
        stem_te: 'x/2 + 1 = 4 అయితే x = ?',
        display: { left: 'x/2 + 1', op: '=', right: '4' },
        answer: '6',
        options: ['6', '8', '3', '5'],
        difficulty: 3,
        hints: [
          'Undo the +1 first: subtract 1 from both sides.',
          'That gives x/2 = 3.',
          'Multiply both sides by 2: x = 6.'
        ],
        aiPrompt: '"Half of x plus 1 equals 4. What is half of x on its own?"',
        aiWrong: '"Undo the +1 first, then undo the divide by 2 by multiplying."',
        aiRight: '"Perfect! x/2 = 3, so x = 6."',
        viz: {
          value: 6,
          balance: { left: 'x/2 + 1', right: '4', unknown: 'x = 6', tilt: 8 },
          inverse: [
            { op: '- 1', note: 'Subtract 1 from both sides' },
            { op: 'x/2 = 3', note: 'Half of x is 3' },
            { op: 'x 2', note: 'Multiply both sides by 2' },
            { op: 'x = 6', note: 'The scale is balanced' }
          ],
          steps: [
            'Start with x/2 + 1 = 4.',
            'Subtract 1 from both sides: x/2 = 3.',
            'Multiply both sides by 2.',
            'So x = 6.'
          ]
        }
      }
    ]
  }
];

export const DEFAULT_TOPIC_ID = 'c5';

export function getLabTopic(topicId) {
  return LAB_TOPICS.find((topic) => topic.id === topicId) || LAB_TOPICS.find((t) => t.id === DEFAULT_TOPIC_ID);
}

export function getProblemCount() {
  return LAB_TOPICS.reduce((sum, topic) => sum + topic.problems.length, 0);
}
