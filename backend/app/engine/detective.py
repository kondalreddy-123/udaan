"""
Learning Detective Engine for UDAAN.

Workflow:
  Learn → Solve → Detect → Confirm → Targeted Support → Reassess → Update Mastery.

Guiding Principles:
  1. Diagnoses are HYPOTHESES, not immutable verdicts.
  2. Distinguish a possible careless error from a repeated misconception using dynamic follow-up evidence.
  3. Tailor follow-up questions to the specific suspected misconception tag.
  4. Supply multi-modal targeted support (Hint, Worked Example with number line, Prerequisite mini-lesson).
  5. Use a fresh reassessment question (same learning objective, new numbers).
  6. Automatically trigger Teacher Action Cards on persistent difficulty.
"""

from typing import Dict, Any, Optional
import uuid

# Pre-packaged diagnostic cases linked to Class 8 NCERT Rational Numbers
DETECTIVE_CASES = {
    "case_rational_add": {
        "concept_id": "c5",
        "concept_title_en": "Adding rational numbers with unlike denominators",
        "concept_title_te": "వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక",
        "prerequisite_id": "c2",
        "prerequisite_title_en": "Equivalent fractions and LCM",
        "prerequisite_title_te": "సమాన భిన్నాలు మరియు క.సా.గు",
        "primary_question": {
            "id": "DET-Q1",
            "stem_en": "Evaluate: (-3/4) + (1/2) = ?",
            "stem_te": "గణించండి: (-3/4) + (1/2) = ?",
            "options": [
                {
                    "text_en": "-1/4",
                    "text_te": "-1/4",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct. Convert 1/2 to 2/4. Then (-3 + 2)/4 = -1/4.",
                    "explanation_te": "సరైనది. 1/2 ను 2/4 గా మార్చండి. (-3 + 2)/4 = -1/4."
                },
                {
                    "text_en": "-1/3",
                    "text_te": "-1/3",
                    "is_correct": False,
                    "tag": "num_den_separate",
                    "explanation_en": "Suspected misconception: Added numerators and denominators separately: (-3+1)/(4+2) = -2/6 = -1/3.",
                    "explanation_te": "లవాలు మరియు హారాలను విడివిడిగా కూడారు: (-3+1)/(4+2) = -2/6 = -1/3."
                },
                {
                    "text_en": "5/4",
                    "text_te": "5/4",
                    "is_correct": False,
                    "tag": "ignored_negative",
                    "explanation_en": "Suspected misconception: Ignored negative sign while converting: (3/4) + (2/4) = 5/4.",
                    "explanation_te": "రుణ గుర్తును విస్మరించారు: (3/4) + (2/4) = 5/4."
                },
                {
                    "text_en": "1/4",
                    "text_te": "1/4",
                    "is_correct": False,
                    "tag": "sign_slip",
                    "explanation_en": "Suspected slip: Sign calculation error in numerator sum (+1/4 instead of -1/4).",
                    "explanation_te": "గుర్తు గణనలో లోపం (+1/4 కి బదులుగా -1/4 ఉండాలి)."
                }
            ]
        },
        "follow_ups": {
            "num_den_separate": {
                "stem_en": "Diagnostic Follow-up: 1/2 + 1/2 = ?",
                "stem_te": "నిర్ధారణ ప్రశ్న: 1/2 + 1/2 = ?",
                "options": [
                    {"text_en": "1", "text_te": "1", "is_correct": True, "tag": None},
                    {"text_en": "2/4", "text_te": "2/4", "is_correct": False, "tag": "confirmed_num_den_separate"}
                ],
                "rationale_if_correct": "Low evidence of misconception — student recognizes that halves combine into a whole (1). Initial answer was likely a careless slip.",
                "rationale_if_incorrect": "High evidence of misconception — student answered 2/4, confirming a persistent habit of adding numerators (1+1=2) and denominators (2+2=4)."
            },
            "ignored_negative": {
                "stem_en": "Diagnostic Follow-up: (-2/5) + (3/5) = ?",
                "stem_te": "నిర్ధారణ ప్రశ్న: (-2/5) + (3/5) = ?",
                "options": [
                    {"text_en": "1/5", "text_te": "1/5", "is_correct": True, "tag": None},
                    {"text_en": "5/5 (= 1)", "text_te": "5/5 (= 1)", "is_correct": False, "tag": "confirmed_ignored_negative"}
                ],
                "rationale_if_correct": "Low evidence — student correctly respected negative sign with identical denominators. Initial error likely a slip during LCM conversion.",
                "rationale_if_incorrect": "High evidence — student added absolute values (2+3=5), confirming difficulty applying integer signs to fractions."
            },
            "sign_slip": {
                "stem_en": "Diagnostic Follow-up: (-5) + 3 = ?",
                "stem_te": "నిర్ధారణ ప్రశ్న: (-5) + 3 = ?",
                "options": [
                    {"text_en": "-2", "text_te": "-2", "is_correct": True, "tag": None},
                    {"text_en": "2", "text_te": "2", "is_correct": False, "tag": "confirmed_sign_error"}
                ],
                "rationale_if_correct": "Low evidence of fundamental flaw — basic integer arithmetic intact. Initial answer was an isolated calculation slip.",
                "rationale_if_incorrect": "High evidence of prerequisite gap — confusion with directed integer addition on the number line."
            }
        },
        "support": {
            "hint_en": "Fractions cannot be added by combining tops and bottoms. Denominators tell you the size of each slice! Slices must be of identical size before adding.",
            "hint_te": "భిన్నాలను లవాలు మరియు హారాలను కలపడం ద్వారా కూడలేము. హారాలు ప్రతి భాగం పరిమాణాన్ని తెలియజేస్తాయి! కూడే ముందు భాగాలు సమానంగా ఉండాలి.",
            "worked_example_en": "Step 1: Find LCM of 4 and 2 → LCM is 4.\nStep 2: Convert 1/2 to fourths: (1 × 2)/(2 × 2) = 2/4.\nStep 3: Add numerators: (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.\nNumber Line: Start at 0, move left to -3/4. Move right by +2/4. You stop at -1/4.",
            "worked_example_te": "దశ 1: 4 మరియు 2 ల క.సా.గు కనుగొనండి → క.సా.గు 4.\nదశ 2: 1/2 ను నాల్గవ వంతులుగా మార్చండి: (1 × 2)/(2 × 2) = 2/4.\nదశ 3: లవాలను కూడండి: (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.\nసంఖ్యా రేఖ: 0 నుండి ప్రారంభించి -3/4 కి వెళ్లండి. కుడివైపు +2/4 కదలండి. మీరు -1/4 వద్ద ఆగుతారు.",
            "prerequisite_lesson_en": "Refresher on Equivalent Fractions (NCERT Class 7): Multiplying numerator and denominator by the same non-zero number produces an equal fraction without changing value.",
            "prerequisite_lesson_te": "సమాన భిన్నాల సమీక్ష (క్లాస్ 7): లవం మరియు హారాన్ని ఒకే శూన్యేతర సంఖ్యతో గుణించినప్పుడు భిన్నం విలువ మారదు."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q1",
            "stem_en": "Fresh Reassessment (new numbers): (-2/3) + (1/6) = ?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: (-2/3) + (1/6) = ?",
            "options": [
                {"text_en": "-1/2", "text_te": "-1/2", "is_correct": True, "tag": None},
                {"text_en": "-1/9", "text_te": "-1/9", "is_correct": False, "tag": "num_den_separate"},
                {"text_en": "1/2", "text_te": "1/2", "is_correct": False, "tag": "ignored_negative"},
                {"text_en": "-1/6", "text_te": "-1/6", "is_correct": False, "tag": "arithmetic_slip"}
            ],
            "correct_solution_en": "LCM(3, 6) = 6. Convert -2/3 → -4/6. (-4 + 1)/6 = -3/6 = -1/2.",
            "correct_solution_te": "క.సా.గు(3, 6) = 6. -2/3 → -4/6. (-4 + 1)/6 = -3/6 = -1/2."
        }
    },
    "case_equivalent_fractions": {
        "concept_id": "c1",
        "concept_title_en": "Equivalent Fractions and Multiplicative Scaling",
        "concept_title_te": "సమాన భిన్నాలు మరియు గుణకార రూపాలు",
        "prerequisite_id": "c0",
        "prerequisite_title_en": "Integers and Basic Partitions",
        "prerequisite_title_te": "పూర్ణాంకాలు మరియు ప్రాథమిక భాగాలు",
        "primary_question": {
            "id": "DET-Q2",
            "stem_en": "Which fraction is strictly equivalent to 2/3?",
            "stem_te": "2/3 కు ఖచ్చితమైన సమాన భిన్నం ఏది?",
            "options": [
                {
                    "text_en": "6/9",
                    "text_te": "6/9",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! Both numerator and denominator are multiplied by 3: (2×3)/(3×3) = 6/9.",
                    "explanation_te": "సరైనది! లవం మరియు హారాలు రెండూ 3 చే గుణించబడ్డాయి: (2×3)/(3×3) = 6/9."
                },
                {
                    "text_en": "4/5",
                    "text_te": "4/5",
                    "is_correct": False,
                    "tag": "additive_equivalence",
                    "explanation_en": "Suspected misconception: Added 2 to both numerator and denominator (2+2)/(3+2) = 4/5. Adding changes the fraction's value!",
                    "explanation_te": "లవానికి మరియు హారానికి 2 కూడారు (2+2)/(3+2) = 4/5. కూడటం వల్ల భిన్నం విలువ మారుతుంది!"
                },
                {
                    "text_en": "3/2",
                    "text_te": "3/2",
                    "is_correct": False,
                    "tag": "reciprocal_confusion",
                    "explanation_en": "Suspected confusion: Inverted the fraction into its reciprocal instead of scaling.",
                    "explanation_te": "భిన్నాన్ని తిరగరాసి వ్యుత్క్రమంగా మార్చారు."
                },
                {
                    "text_en": "2/6",
                    "text_te": "2/6",
                    "is_correct": False,
                    "tag": "denominator_only_scaled",
                    "explanation_en": "Suspected error: Multiplied denominator only, shrinking the value to 1/3.",
                    "explanation_te": "హారాన్ని మాత్రమే రెట్టింపు చేశారు, లవాన్ని గుణించలేదు."
                }
            ]
        },
        "follow_ups": {
            "additive_equivalence": {
                "stem_en": "Diagnostic Follow-up: Does 1/2 equal (1+1)/(2+1) = 2/3?",
                "stem_te": "నిర్ధారణ ప్రశ్న: 1/2 అనేది (1+1)/(2+1) = 2/3 కి సమానమా?",
                "options": [
                    {"text_en": "No, 1/2 is 50% while 2/3 is about 67%", "text_te": "కాదు, 1/2 అంటే 50% కానీ 2/3 అంటే దాదాపు 67%", "is_correct": True, "tag": None},
                    {"text_en": "Yes, adding equal numbers keeps fractions equal", "text_te": "అవును, ఒకే సంఖ్యను కూడితే భిన్నం సమానంగా ఉంటుంది", "is_correct": False, "tag": "confirmed_additive_equivalence"}
                ],
                "rationale_if_correct": "Low evidence — learner understands that addition alters the part-to-whole ratio.",
                "rationale_if_incorrect": "High evidence — learner believes addition preserves fraction equivalence (additive scaling misconception)."
            },
            "reciprocal_confusion": {
                "stem_en": "Diagnostic Follow-up: If a recipe needs 1/4 cup, is 4/1 cups the same amount?",
                "stem_te": "నిర్ధారణ ప్రశ్న: 1/4 కప్పు మరియు 4/1 కప్పులు సమానమా?",
                "options": [
                    {"text_en": "No, 4/1 is 4 whole cups!", "text_te": "కాదు, 4/1 అంటే 4 పూర్తి కప్పులు!", "is_correct": True, "tag": None},
                    {"text_en": "Yes, it is the same fraction flipped", "text_te": "అవును, తిరగరాసిన భిన్నం సమానమే", "is_correct": False, "tag": "confirmed_reciprocal_confusion"}
                ],
                "rationale_if_correct": "Low evidence of fundamental flaw.",
                "rationale_if_incorrect": "High evidence of confusing reciprocals with equivalence."
            }
        },
        "support": {
            "hint_en": "To create equivalent fractions, MULTIPLY or DIVIDE top and bottom by the exact same number. Never add or subtract!",
            "hint_te": "సమాన భిన్నాలను పొందడానికి లవం మరియు హారాన్ని ఒకే సంఖ్యతో గుణించాలి లేదా భాగించాలి. ఎప్పుడూ కూడకూడదు!",
            "worked_example_en": "Take 2/3. Multiplying by (3/3): (2 × 3) / (3 × 3) = 6/9.\nVisual: Draw 3 equal bars and shade 2. Now cut every bar into 3 smaller strips. You now have 6 shaded strips out of 9 total strips. The shaded area is identical!",
            "worked_example_te": "2/3 తీసుకోండి. (3/3) తో గుణించండి: (2 × 3) / (3 × 3) = 6/9.\nచిత్రరూపం: 3 భాగాలలో 2 భాగాలు రంగు వేయబడ్డాయి. ప్రతి భాగాన్ని మళ్ళీ 3 చిన్న ముక్కలుగా విభజిస్తే మొత్తం 9 లో 6 భాగాలు అవుతాయి. విస్తీర్ణం మారదు!",
            "prerequisite_lesson_en": "Fraction Bars & Area Model: Equivalent fractions represent the exact same proportion of the whole.",
            "prerequisite_lesson_te": "భిన్నాల నమూనా: సమాన భిన్నాలు ఒకే మొత్తంలో సమాన పరిమాణాన్ని సూచిస్తాయి."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q2",
            "stem_en": "Fresh Reassessment: Which fraction is strictly equivalent to 3/5?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: 3/5 కు ఖచ్చితమైన సమాన భిన్నం ఏది?",
            "options": [
                {"text_en": "9/15", "text_te": "9/15", "is_correct": True, "tag": None},
                {"text_en": "5/7", "text_te": "5/7", "is_correct": False, "tag": "additive_equivalence"},
                {"text_en": "5/3", "text_te": "5/3", "is_correct": False, "tag": "reciprocal_confusion"},
                {"text_en": "6/5", "text_te": "6/5", "is_correct": False, "tag": "numerator_only_scaled"}
            ],
            "correct_solution_en": "Multiply top and bottom by 3: (3×3)/(5×3) = 9/15.",
            "correct_solution_te": "లవం మరియు హారాన్ని 3 చే గుణించండి: (3×3)/(5×3) = 9/15."
        }
    },
    "case_sign_confusion": {
        "concept_id": "c4",
        "concept_title_en": "Signed Rational Subtraction and Double Negatives",
        "concept_title_te": "రుణ అకరణీయ సంఖ్యల తీసివేత మరియు గుర్తుల నియమాలు",
        "prerequisite_id": "c0",
        "prerequisite_title_en": "Integers and Directed Numbers",
        "prerequisite_title_te": "పూర్ణాంకాలు మరియు సంఖ్యా రేఖ",
        "primary_question": {
            "id": "DET-Q3",
            "stem_en": "Evaluate: (-2/7) - (-3/7) = ?",
            "stem_te": "గణించండి: (-2/7) - (-3/7) = ?",
            "options": [
                {
                    "text_en": "1/7",
                    "text_te": "1/7",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! Subtracting a negative is adding: (-2 - (-3))/7 = (-2 + 3)/7 = 1/7.",
                    "explanation_te": "సరైనది! రుణ సంఖ్యను తీసివేయడం అంటే కూడటం: (-2 + 3)/7 = 1/7."
                },
                {
                    "text_en": "-5/7",
                    "text_te": "-5/7",
                    "is_correct": False,
                    "tag": "dropped_double_negative",
                    "explanation_en": "Suspected misconception: Treated -(-3) as -3, leading to -2 - 3 = -5/7.",
                    "explanation_te": "రుణ గుర్తు నియమాన్ని విస్మరించి -2 - 3 = -5/7 గా లెక్కించారు."
                },
                {
                    "text_en": "-1/7",
                    "text_te": "-1/7",
                    "is_correct": False,
                    "tag": "sign_slip",
                    "explanation_en": "Suspected slip: Incorrect sign in the final addition (-2 + 3 = -1 instead of +1).",
                    "explanation_te": "చివరి సంకలనంలో గుర్తు పొరపాటు (-2 + 3 = +1 ఉండాలి)."
                },
                {
                    "text_en": "5/7",
                    "text_te": "5/7",
                    "is_correct": False,
                    "tag": "ignored_all_negatives",
                    "explanation_en": "Suspected error: Dropped all negative signs completely (2+3)/7 = 5/7.",
                    "explanation_te": "అన్ని రుణ గుర్తులను విస్మరించి కూడారు."
                }
            ]
        },
        "follow_ups": {
            "dropped_double_negative": {
                "stem_en": "Diagnostic Follow-up: Evaluate integer subtraction: (-2) - (-3) = ?",
                "stem_te": "నిర్ధారణ ప్రశ్న: (-2) - (-3) = ?",
                "options": [
                    {"text_en": "1", "text_te": "1", "is_correct": True, "tag": None},
                    {"text_en": "-5", "text_te": "-5", "is_correct": False, "tag": "confirmed_dropped_double_negative"}
                ],
                "rationale_if_correct": "Low evidence — student applies double-negative rule accurately in integer form.",
                "rationale_if_incorrect": "High evidence — student struggles with the subtraction of negative numbers on the number line."
            }
        },
        "support": {
            "hint_en": "Remember the integer rule: a - (-b) = a + b. Subtracting a negative means moving RIGHT on the number line!",
            "hint_te": "గుర్తుంచుకోండి: a - (-b) = a + b. రుణ సంఖ్యను తీసివేయడం అంటే సంఖ్యా రేఖపై కుడివైపుకు కదలడం!",
            "worked_example_en": "(-2/7) - (-3/7) = (-2 - (-3)) / 7.\nSince -(-3) = +3, numerator is -2 + 3 = 1.\nResult = 1/7.",
            "worked_example_te": "(-2/7) - (-3/7) = (-2 + 3) / 7 = 1/7.\nసంఖ్యా రేఖపై -2 వద్ద మొదలై కుడివైపు 3 అడుగులు వేస్తే +1 వద్ద ఆగుతారు.",
            "prerequisite_lesson_en": "NCERT Class 7 Integers: Subtracting negative integers is equivalent to adding their additive inverse.",
            "prerequisite_lesson_te": "క్లాస్ 7 పూర్ణాంకాలు: సంకలన విలోమాన్ని కూడటం."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q3",
            "stem_en": "Fresh Reassessment: Evaluate: (-3/8) - (-5/8) = ?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: (-3/8) - (-5/8) = ?",
            "options": [
                {"text_en": "2/8 (= 1/4)", "text_te": "2/8 (= 1/4)", "is_correct": True, "tag": None},
                {"text_en": "-8/8 (= -1)", "text_te": "-8/8 (= -1)", "is_correct": False, "tag": "dropped_double_negative"},
                {"text_en": "-2/8 (= -1/4)", "text_te": "-2/8 (= -1/4)", "is_correct": False, "tag": "sign_slip"},
                {"text_en": "8/8 (= 1)", "text_te": "8/8 (= 1)", "is_correct": False, "tag": "ignored_all_negatives"}
            ],
            "correct_solution_en": "(-3 - (-5))/8 = (-3 + 5)/8 = 2/8 = 1/4.",
            "correct_solution_te": "(-3 + 5)/8 = 2/8 = 1/4."
        }
    },
    "case_number_line": {
        "concept_id": "c4",
        "concept_title_en": "Comparing & Ordering Negative Rational Numbers",
        "concept_title_te": "రుణ అకరణీయ సంఖ్యల పోలిక మరియు అమరిక",
        "prerequisite_id": "c0",
        "prerequisite_title_en": "Directed Numbers on the Number Line",
        "prerequisite_title_te": "సంఖ్యా రేఖపై పూర్ణాంకాలు",
        "primary_question": {
            "id": "DET-Q4",
            "stem_en": "Which inequality statement is TRUE?",
            "stem_te": "కింది వాటిలో ఏ అసమానత నిజమైనది?",
            "options": [
                {
                    "text_en": "-1/2 > -3/4",
                    "text_te": "-1/2 > -3/4",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! -1/2 (-0.5) is closer to 0 and lies to the right of -3/4 (-0.75) on the number line.",
                    "explanation_te": "సరైనది! -1/2 (-0.5) అనేది -3/4 (-0.75) కు కుడివైపున సున్నాకు దగ్గరగా ఉంటుంది."
                },
                {
                    "text_en": "-3/4 > -1/2",
                    "text_te": "-3/4 > -1/2",
                    "is_correct": False,
                    "tag": "magnitude_inversion",
                    "explanation_en": "Suspected misconception: Since 3/4 > 1/2 in positive numbers, assumed -3/4 > -1/2. For negative numbers, order is reversed!",
                    "explanation_te": "ధన సంఖ్యలలో 3/4 > 1/2 కాబట్టి, రుణ సంఖ్యలలో కూడా అలాగే ఉంటుందని భావించారు. రుణ సంఖ్యలలో క్రమం తిరగబడుతుంది!"
                },
                {
                    "text_en": "-1/2 < -1",
                    "text_te": "-1/2 < -1",
                    "is_correct": False,
                    "tag": "distance_from_zero_error",
                    "explanation_en": "Suspected error: Placed -1/2 further to the left than -1.",
                    "explanation_te": "-1/2 ను -1 కంటే ఎడమవైపున ఉంచారు."
                },
                {
                    "text_en": "-1/2 = -3/4",
                    "text_te": "-1/2 = -3/4",
                    "is_correct": False,
                    "tag": "denominator_ignored",
                    "explanation_en": "Suspected error: Ignored different denominators.",
                    "explanation_te": "వేర్వేరు హారాలను సమానం చేయకుండా పోల్చారు."
                }
            ]
        },
        "follow_ups": {
            "magnitude_inversion": {
                "stem_en": "Diagnostic Follow-up: Which integer is greater: -2 or -5?",
                "stem_te": "నిర్ధారణ ప్రశ్న: ఏ పూర్ణాంకం పెద్దది: -2 లేదా -5?",
                "options": [
                    {"text_en": "-2 (it is closer to 0)", "text_te": "-2 (ఇది సున్నాకు దగ్గరగా ఉంది)", "is_correct": True, "tag": None},
                    {"text_en": "-5 (because 5 > 2)", "text_te": "-5 (ఎందుకంటే 5 > 2)", "is_correct": False, "tag": "confirmed_magnitude_inversion"}
                ],
                "rationale_if_correct": "Low evidence — learner correctly understands negative ordering in integers.",
                "rationale_if_incorrect": "High evidence — learner judges negative rational magnitude using absolute value only."
            }
        },
        "support": {
            "hint_en": "On any horizontal number line, the number further to the RIGHT is always greater. Closer to 0 means greater for negatives!",
            "hint_te": "సంఖ్యా రేఖపై కుడివైపున ఉండే సంఖ్య ఎల్లప్పుడూ పెద్దది. రుణ సంఖ్యలలో సున్నాకు దగ్గరగా ఉండేదే పెద్దది!",
            "worked_example_en": "Compare -1/2 and -3/4:\nConvert to common denominator: -2/4 vs -3/4.\nOn number line: 0 ... -1/4 ... -2/4 ... -3/4 ... -1.\nSince -2/4 lies to the right of -3/4, -1/2 > -3/4.",
            "worked_example_te": "-1/2 మరియు -3/4 లను పోల్చండి:\nసమాన హారాలు: -2/4 మరియు -3/4.\nసంఖ్యా రేఖపై -2/4 అనేది -3/4 కు కుడివైపు ఉంటుంది, కాబట్టి -1/2 > -3/4.",
            "prerequisite_lesson_en": "Number Line Orientation: Negative direction extends leftward away from zero.",
            "prerequisite_lesson_te": "సంఖ్యా రేఖపై రుణ సంఖ్యల స్థానం: సున్నా నుండి ఎడమవైపు."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q4",
            "stem_en": "Fresh Reassessment: Which inequality is TRUE?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: ఏ అసమానత నిజమైనది?",
            "options": [
                {"text_en": "-1/3 > -2/3", "text_te": "-1/3 > -2/3", "is_correct": True, "tag": None},
                {"text_en": "-2/3 > -1/3", "text_te": "-2/3 > -1/3", "is_correct": False, "tag": "magnitude_inversion"},
                {"text_en": "-2/3 > 0", "text_te": "-2/3 > 0", "is_correct": False, "tag": "sign_direction_flip"},
                {"text_en": "-1/3 = -2/3", "text_te": "-1/3 = -2/3", "is_correct": False, "tag": "denominator_ignored"}
            ],
            "correct_solution_en": "-1/3 (-0.33) is to the right of -2/3 (-0.67), so -1/3 > -2/3.",
            "correct_solution_te": "-1/3 అనేది సంఖ్యా రేఖపై -2/3 కంటే కుడివైపు ఉంటుంది, కాబట్టి -1/3 > -2/3."
        }
    },
    "case_mult_div_confusion": {
        "concept_id": "c6",
        "concept_title_en": "Multiplication & Division of Rational Numbers",
        "concept_title_te": "అకరణీయ సంఖ్యల గుణకారం మరియు భాగహారం",
        "prerequisite_id": "c1",
        "prerequisite_title_en": "Fractions and Reciprocals",
        "prerequisite_title_te": "భిన్నాలు మరియు వ్యుత్క్రమాలు",
        "primary_question": {
            "id": "DET-Q5",
            "stem_en": "Evaluate: (2/3) ÷ (3/4) = ?",
            "stem_te": "గణించండి: (2/3) ÷ (3/4) = ?",
            "options": [
                {
                    "text_en": "8/9",
                    "text_te": "8/9",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! Invert the divisor and multiply: (2/3) × (4/3) = 8/9.",
                    "explanation_te": "సరైనది! రెండవ భిన్నాన్ని తిరగరాసి గుణించండి: (2/3) × (4/3) = 8/9."
                },
                {
                    "text_en": "6/12 (= 1/2)",
                    "text_te": "6/12 (= 1/2)",
                    "is_correct": False,
                    "tag": "straight_across_division",
                    "explanation_en": "Suspected misconception: Multiplied straight across (2×3)/(3×4) without taking the reciprocal of the divisor.",
                    "explanation_te": "రెండవ భిన్నాన్ని తిరగరాయకుండా నేరుగా గుణించారు: (2×3)/(3×4) = 6/12."
                },
                {
                    "text_en": "9/8",
                    "text_te": "9/8",
                    "is_correct": False,
                    "tag": "inverted_dividend",
                    "explanation_en": "Suspected error: Inverted the first fraction instead of the divisor: (3/2) × (3/4) = 9/8.",
                    "explanation_te": "రెండవ భిన్నానికి బదులుగా మొదటి భిన్నాన్ని తిరగరాశారు."
                },
                {
                    "text_en": "5/7",
                    "text_te": "5/7",
                    "is_correct": False,
                    "tag": "cross_added",
                    "explanation_en": "Suspected error: Added tops and bottoms (2+3)/(3+4) = 5/7.",
                    "explanation_te": "లవాలు మరియు హారాలను కూడారు."
                }
            ]
        },
        "follow_ups": {
            "straight_across_division": {
                "stem_en": "Diagnostic Follow-up: How do you divide a fraction by a/b?",
                "stem_te": "నిర్ధారణ ప్రశ్న: a/b భిన్నంతో ఎలా భాగించాలి?",
                "options": [
                    {"text_en": "Multiply by its reciprocal b/a", "text_te": "దాని వ్యుత్క్రమం b/a చే గుణించాలి", "is_correct": True, "tag": None},
                    {"text_en": "Multiply numerators and denominators straight across", "text_te": "లవాలు మరియు హారాలను నేరుగా గుణించాలి", "is_correct": False, "tag": "confirmed_straight_division"}
                ],
                "rationale_if_correct": "Low evidence of persistent gap — student states algorithm correctly.",
                "rationale_if_incorrect": "High evidence — student confuses fraction division with fraction multiplication."
            }
        },
        "support": {
            "hint_en": "Keep - Change - Flip! Keep the first fraction, Change ÷ to ×, Flip the second fraction to its reciprocal.",
            "hint_te": "మొదటి భిన్నాన్ని అలాగే ఉంచండి, ÷ గుర్తును × గా మార్చండి, రెండవ భిన్నాన్ని తిరగరాయండి (వ్యుత్క్రమం)!",
            "worked_example_en": "(2/3) ÷ (3/4) = (2/3) × (4/3) = (2 × 4) / (3 × 3) = 8/9.",
            "worked_example_te": "(2/3) ÷ (3/4) = (2/3) × (4/3) = (2 × 4) / (3 × 3) = 8/9.",
            "prerequisite_lesson_en": "Reciprocal (Multiplicative Inverse): A number multiplied by its reciprocal equals 1.",
            "prerequisite_lesson_te": "గుణకార విలోమం: ఒక సంఖ్యను దాని విలోమంతో గుణిస్తే 1 వస్తుంది."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q5",
            "stem_en": "Fresh Reassessment: Evaluate: (3/5) ÷ (2/3) = ?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: (3/5) ÷ (2/3) = ?",
            "options": [
                {"text_en": "9/10", "text_te": "9/10", "is_correct": True, "tag": None},
                {"text_en": "6/15 (= 2/5)", "text_te": "6/15 (= 2/5)", "is_correct": False, "tag": "straight_across_division"},
                {"text_en": "10/9", "text_te": "10/9", "is_correct": False, "tag": "inverted_dividend"},
                {"text_en": "5/8", "text_te": "5/8", "is_correct": False, "tag": "cross_added"}
            ],
            "correct_solution_en": "(3/5) × (3/2) = (3 × 3) / (5 × 2) = 9/10.",
            "correct_solution_te": "(3/5) × (3/2) = 9/10."
        }
    },
    "case_simplification_cancel": {
        "concept_id": "c1",
        "concept_title_en": "Fraction Simplification and Factor Cancellation",
        "concept_title_te": "భిన్నాల సూక్ష్మీకరణ మరియు సామాన్య కారణాంకాల రద్దు",
        "prerequisite_id": "c1",
        "prerequisite_title_en": "Factors & Equivalent Forms",
        "prerequisite_title_te": "కారణాంకాలు మరియు సమాన రూపాలు",
        "primary_question": {
            "id": "DET-Q6",
            "stem_en": "Simplify: (4 + 6) / 4 = ?",
            "stem_te": "సూక్ష్మీకరించండి: (4 + 6) / 4 = ?",
            "options": [
                {
                    "text_en": "5/2 (= 2.5)",
                    "text_te": "5/2 (= 2.5)",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! Sum the numerator first: 10/4 = 5/2. Only common FACTORS can be cancelled, never addends!",
                    "explanation_te": "సరైనది! మొదట లవాన్ని కూడాలి: 10/4 = 5/2. కారణాంకాలను మాత్రమే రద్దు చేయాలి, కూడికలోని పదాలను కాదు!"
                },
                {
                    "text_en": "7",
                    "text_te": "7",
                    "is_correct": False,
                    "tag": "cancelled_additive_term",
                    "explanation_en": "Suspected misconception: Cancelled 4 in numerator with denominator 4 (4/4 = 1) and added 6: 1 + 6 = 7.",
                    "explanation_te": "లవంలోని 4 ను హారంలోని 4 తో రద్దు చేసి (1), 6 కి కూడారు: 1 + 6 = 7."
                },
                {
                    "text_en": "6",
                    "text_te": "6",
                    "is_correct": False,
                    "tag": "cancelled_and_dropped",
                    "explanation_en": "Suspected error: Crossed out 4s entirely and left 6.",
                    "explanation_te": "4 లను తొలగించి కేవలం 6 ను మాత్రమే మిగిల్చారు."
                },
                {
                    "text_en": "4/10",
                    "text_te": "4/10",
                    "is_correct": False,
                    "tag": "inverted_fraction",
                    "explanation_en": "Suspected error: Inverted the fraction.",
                    "explanation_te": "భిన్నాన్ని తిరగరాశారు."
                }
            ]
        },
        "follow_ups": {
            "cancelled_additive_term": {
                "stem_en": "Diagnostic Follow-up: In the expression (2 + 8)/2, can we cancel the 2s to get 1 + 8 = 9?",
                "stem_te": "నిర్ధారణ ప్రశ్న: (2 + 8)/2 లో 2 లను రద్దు చేసి 1 + 8 = 9 గా రాయవచ్చా?",
                "options": [
                    {"text_en": "No, (2+8)/2 = 10/2 = 5, not 9!", "text_te": "లేదు, (2+8)/2 = 10/2 = 5 అవుతుంది, 9 కాదు!", "is_correct": True, "tag": None},
                    {"text_en": "Yes, matching numbers top and bottom always cancel", "text_te": "అవును, ఒకే సంఖ్య ఉంటే ఎప్పుడైనా రద్దు చేయవచ్చు", "is_correct": False, "tag": "confirmed_additive_cancel"}
                ],
                "rationale_if_correct": "Low evidence — student recognizes order of operations and factor vs addend rules.",
                "rationale_if_incorrect": "High evidence — student routinely cancels addends across the fraction bar."
            }
        },
        "support": {
            "hint_en": "RULE: You can only cancel common FACTORS that multiply the entire numerator. You CANNOT cancel numbers that are added!",
            "hint_te": "నియమం: గుణకారం రూపంలో ఉన్న కారణాంకాలను మాత్రమే రద్దు చేయాలి. కూడిక రూపంలో ఉన్న పదాలను రద్దు చేయకూడదు!",
            "worked_example_en": "(4 + 6) / 4 = 10/4.\nBoth 10 and 4 share factor 2: (5 × 2) / (2 × 2) = 5/2 = 2.5.\nAlternatively: (4/4) + (6/4) = 1 + 1.5 = 2.5.",
            "worked_example_te": "(4 + 6) / 4 = 10/4 = 5/2 = 2.5.\nలేదా: (4/4) + (6/4) = 1 + 1.5 = 2.5.",
            "prerequisite_lesson_en": "Distributive Property in Division: The denominator divides every term in the numerator.",
            "prerequisite_lesson_te": "విభాగ న్యాయం: హారం లవంలోని ప్రతి పదాన్ని భాగిస్తుంది."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q6",
            "stem_en": "Fresh Reassessment: Simplify: (6 + 9) / 3 = ?",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: (6 + 9) / 3 = ?",
            "options": [
                {"text_en": "5", "text_te": "5", "is_correct": True, "tag": None},
                {"text_en": "11", "text_te": "11", "is_correct": False, "tag": "cancelled_additive_term"},
                {"text_en": "9", "text_te": "9", "is_correct": False, "tag": "cancelled_and_dropped"},
                {"text_en": "3/15", "text_te": "3/15", "is_correct": False, "tag": "inverted_fraction"}
            ],
            "correct_solution_en": "(6 + 9) / 3 = 15/3 = 5.",
            "correct_solution_te": "(6 + 9) / 3 = 15/3 = 5."
        }
    },
    "case_mixed_to_improper": {
        "concept_id": "c3",
        "concept_title_en": "Mixed Numbers to Improper Rational Numbers",
        "concept_title_te": "మిశ్రమ భిన్నాలను అపక్రమ భిన్నాలుగా మార్చడం",
        "prerequisite_id": "c1",
        "prerequisite_title_en": "Rational Meaning p/q",
        "prerequisite_title_te": "అకరణీయ సంఖ్యల నిర్వచనం p/q",
        "primary_question": {
            "id": "DET-Q7",
            "stem_en": "Convert the mixed number -2 3/4 to an improper rational number p/q:",
            "stem_te": "-2 3/4 మిశ్రమ భిన్నాన్ని p/q రూపంలో రాయండి:",
            "options": [
                {
                    "text_en": "-11/4",
                    "text_te": "-11/4",
                    "is_correct": True,
                    "tag": None,
                    "explanation_en": "Correct! -(2 × 4 + 3)/4 = -11/4.",
                    "explanation_te": "సరైనది! -(2 × 4 + 3)/4 = -11/4."
                },
                {
                    "text_en": "-6/4",
                    "text_te": "-6/4",
                    "is_correct": False,
                    "tag": "multiplied_whole_by_num",
                    "explanation_en": "Suspected misconception: Multiplied whole part by numerator: -(2×3)/4 = -6/4.",
                    "explanation_te": "పూర్ణాంకాన్ని లవంతో గుణించారు: -(2×3)/4 = -6/4."
                },
                {
                    "text_en": "11/4",
                    "text_te": "11/4",
                    "is_correct": False,
                    "tag": "dropped_negative_sign",
                    "explanation_en": "Suspected error: Dropped the overall negative sign.",
                    "explanation_te": "రుణ గుర్తును విస్మరించారు."
                },
                {
                    "text_en": "-5/4",
                    "text_te": "-5/4",
                    "is_correct": False,
                    "tag": "added_whole_to_num",
                    "explanation_en": "Suspected error: Added whole part to numerator without multiplying denominator: -(2+3)/4 = -5/4.",
                    "explanation_te": "హారంతో గుణించకుండా నేరుగా కూడారు: -(2+3)/4 = -5/4."
                }
            ]
        },
        "follow_ups": {
            "multiplied_whole_by_num": {
                "stem_en": "Diagnostic Follow-up: How many half-slices are in 2 1/2 pizzas?",
                "stem_te": "నిర్ధారణ ప్రశ్న: 2 1/2 పిజ్జాలలో ఎన్ని సగభాగాల ముక్కలు ఉంటాయి?",
                "options": [
                    {"text_en": "5 half-slices (2 wholes × 2 halves each + 1 = 5)", "text_te": "5 సగభాగాల ముక్కలు (2 × 2 + 1 = 5)", "is_correct": True, "tag": None},
                    {"text_en": "2 half-slices (2 × 1 = 2)", "text_te": "2 సగభాగాల ముక్కలు (2 × 1 = 2)", "is_correct": False, "tag": "confirmed_multiplied_whole_by_num"}
                ],
                "rationale_if_correct": "Low evidence — learner grasps that whole units must be partitioned into denominator parts.",
                "rationale_if_incorrect": "High evidence — learner confuses multiplication of whole by numerator with partitioning."
            }
        },
        "support": {
            "hint_en": "To convert -A B/C: Keep the negative outside! Multiply Whole A by Denominator C, then add Numerator B: -((A×C + B)/C).",
            "hint_te": "-A B/C ను మార్చడానికి: రుణ గుర్తును బయట ఉంచండి! A ను C చే గుణించి, B ని కూడండి: -((A×C + B)/C).",
            "worked_example_en": "For -2 3/4:\n2 wholes = 2 × 4 = 8 fourths.\nAdd 3 fourths = 8 + 3 = 11 fourths.\nApply negative sign = -11/4.",
            "worked_example_te": "-2 3/4 కోసం:\n2 పూర్తి భాగాలు = 2 × 4 = 8 నాల్గవ వంతులు.\nమిగిలిన 3 భాగాలు కూడితే 8 + 3 = 11.\nరుణ గుర్తును చేర్చితే = -11/4.",
            "prerequisite_lesson_en": "Part-Whole Meaning of Rational Numbers: p/q represents p parts of size 1/q.",
            "prerequisite_lesson_te": "అకరణీయ సంఖ్యల అర్థం: p/q అనగా 1/q పరిమాణం గల p భాగాలు."
        },
        "reassessment": {
            "id": "DET-REASSESS-Q7",
            "stem_en": "Fresh Reassessment: Convert -3 2/5 to an improper rational number p/q:",
            "stem_te": "కొత్త పునఃపరిశీలన ప్రశ్న: -3 2/5 ను p/q రూపంలో రాయండి:",
            "options": [
                {"text_en": "-17/5", "text_te": "-17/5", "is_correct": True, "tag": None},
                {"text_en": "-6/5", "text_te": "-6/5", "is_correct": False, "tag": "multiplied_whole_by_num"},
                {"text_en": "17/5", "text_te": "17/5", "is_correct": False, "tag": "dropped_negative_sign"},
                {"text_en": "-5/5 (= -1)", "text_te": "-5/5 (= -1)", "is_correct": False, "tag": "added_whole_to_num"}
            ],
            "correct_solution_en": "-(3 × 5 + 2)/5 = -(15 + 2)/5 = -17/5.",
            "correct_solution_te": "-(3 × 5 + 2)/5 = -17/5."
        }
    }
}


class DetectiveSession:
    def __init__(self, case_id: str = "case_rational_add"):
        self.case_id = case_id
        self.case = DETECTIVE_CASES.get(case_id, DETECTIVE_CASES["case_rational_add"])
        self.state = "solve"  # solve, confirm, retry_slip, support, reassess, done, persistent
        self.selected_primary_index: Optional[int] = None
        self.suspected_tag: Optional[str] = None
        self.hypothesis: Optional[str] = None
        self.evidence_strength: str = "None"
        self.evidence_rationale: str = ""
        self.follow_up_correct: Optional[bool] = None
        self.reassessment_correct: Optional[bool] = None
        self.teacher_card_generated: bool = False
        self.action_card_data: Optional[Dict[str, Any]] = None

    def submit_primary(self, option_index: int) -> Dict[str, Any]:
        self.selected_primary_index = option_index
        q = self.case["primary_question"]
        opt = q["options"][option_index]
        is_correct = opt["is_correct"]

        if is_correct:
            self.state = "done"
            self.evidence_strength = "Mastered"
            self.evidence_rationale = "Correct answer selected on initial attempt."
            return {
                "state": self.state,
                "is_correct": True,
                "message": "Correct! Full understanding demonstrated. Mastery updated.",
                "concept_id": self.case["concept_id"]
            }

        # Distractor chosen
        self.suspected_tag = opt.get("tag", "unknown_error")
        self.hypothesis = f"Hypothesis: Learner exhibited '{self.suspected_tag}'. Evidence is preliminary and must be verified."
        self.state = "confirm"
        self.evidence_strength = "Low (Single observation)"

        follow_up = self.case["follow_ups"].get(self.suspected_tag)
        if not follow_up:
            # Fallback to general follow-up
            follow_up = list(self.case["follow_ups"].values())[0]

        return {
            "state": self.state,
            "is_correct": False,
            "suspected_tag": self.suspected_tag,
            "hypothesis": self.hypothesis,
            "evidence_strength": self.evidence_strength,
            "follow_up_question": follow_up,
            "concept_id": self.case["concept_id"]
        }

    def submit_followup(self, is_correct: bool) -> Dict[str, Any]:
        self.follow_up_correct = is_correct
        follow_up_data = self.case["follow_ups"].get(self.suspected_tag, {})

        if is_correct:
            self.state = "retry_slip"
            self.evidence_strength = "Low (Refuted - Likely careless slip)"
            self.evidence_rationale = follow_up_data.get(
                "rationale_if_correct",
                "Follow-up answered correctly. Initial error appears to be a careless slip."
            )
            return {
                "state": self.state,
                "is_slip": True,
                "evidence_strength": self.evidence_strength,
                "evidence_rationale": self.evidence_rationale,
                "retry_prompt": "Careless slip detected! Retry the original problem with careful attention to signs and denominators."
            }
        else:
            self.state = "support"
            self.evidence_strength = "Medium-High (Confirmed misconception pattern)"
            self.evidence_rationale = follow_up_data.get(
                "rationale_if_incorrect",
                "Follow-up answered with the same error pattern, confirming conceptual misunderstanding."
            )
            return {
                "state": self.state,
                "is_slip": False,
                "evidence_strength": self.evidence_strength,
                "evidence_rationale": self.evidence_rationale,
                "support": self.case["support"],
                "reassessment": self.case["reassessment"]
            }

    def submit_reassessment(self, option_index: int, student_name: str = "Learner (Demo)") -> Dict[str, Any]:
        reassess_q = self.case["reassessment"]
        opt = reassess_q["options"][option_index]
        is_correct = opt["is_correct"]
        self.reassessment_correct = is_correct

        if is_correct:
            self.state = "done"
            self.evidence_strength = "Resolved (Recovery verified)"
            return {
                "state": self.state,
                "recovered": True,
                "message": "Recovered! Fresh reassessment passed. Case closed successfully.",
                "solution": reassess_q["correct_solution_en"],
                "concept_id": self.case["concept_id"]
            }
        else:
            self.state = "persistent"
            self.evidence_strength = "Persistent difficulty"
            self.teacher_card_generated = True

            self.action_card_data = {
                "id": str(uuid.uuid4())[:8],
                "student_name": student_name,
                "concept_id": self.case["concept_id"],
                "concept_title": self.case["concept_title_en"],
                "observation": f"Learner exhibited '{self.suspected_tag}', confirmed via follow-up, and failed fresh reassessment with distractor '{opt['text_en']}'.",
                "triggering_rule": "Reassessment failed after targeted intervention",
                "suggested_action": f"Provide small-group tactile fraction manipulatives on prerequisite: {self.case['prerequisite_title_en']}. Conduct 1-on-1 check-in.",
                "reassessment_status": "failed",
                "status": "pending",
                "is_sample": False
            }

            return {
                "state": self.state,
                "recovered": False,
                "message": "Persistent difficulty detected. An explainable Teacher Action Card has been automatically raised for teacher review.",
                "action_card": self.action_card_data,
                "concept_id": self.case["concept_id"]
            }
