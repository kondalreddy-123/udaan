"""
AI Pedagogical Service for UDAAN.

Provides:
  1. Gemini API integration with timeout handling (3.5s) and retry limits.
  2. Complete, deterministic rule-based fallback system in English and Telugu.
  3. Safe credential handling via backend environment variables (GEMINI_API_KEY).
  4. Structured misconception explanations for students and teachers.
"""

import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

logger = logging.getLogger("udaan.ai")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Comprehensive NCERT Class 8 Rational Numbers Misconception Rule Knowledge Base
PEDAGOGICAL_RULE_KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    "num_den_separate": {
        "title_en": "Direct Addition of Numerators and Denominators",
        "title_te": "లవాలు మరియు హారాలను నేరుగా కూడటం",
        "explanation_en": "You added the top numbers and bottom numbers separately. In fractions, the denominator represents the size of each slice! Slices of different sizes cannot be combined until you find a common denominator (LCM).",
        "explanation_te": "మీరు లవాలు మరియు హారాలను విడివిడిగా కూడారు. భిన్నాలలో హారం ప్రతి భాగం పరిమాణాన్ని తెలియజేస్తుంది! వేర్వేరు పరిమాణాల భాగాలను క.సా.గు ద్వారా సమానం చేసే వరకు కలపలేము.",
        "hint_en": "Step 1: Find LCM of the denominators. Step 2: Convert both fractions into equivalent fourths/sixths. Step 3: Add only the top numbers.",
        "hint_te": "దశ 1: హారాల క.సా.గు కనుగొనండి. దశ 2: రెండు భిన్నాలను సమాన హారాలలోకి మార్చండి. దశ 3: లవాలను మాత్రమే కూడండి.",
        "analogy_en": "Imagine adding 1 big pizza slice and 1 small cupcake slice. You don't have 2 slices of the same thing!",
        "analogy_te": "ఒక పెద్ద పిజ్జా ముక్క మరియు ఒక చిన్న కేకు ముక్క కలిపినట్లు. రెండూ ఒకే పరిమాణంలో లేనప్పుడు నేరుగా లెక్కించలేము!"
    },
    "ignored_negative": {
        "title_en": "Ignored Negative Sign During Rational Arithmetic",
        "title_te": "అకరణీయ సంఖ్యల కూడికలో రుణ గుర్తును విస్మరించడం",
        "explanation_en": "You treated the negative fraction as positive during the calculation. On the number line, negative numbers move left and positive numbers move right.",
        "explanation_te": "గణన సమయంలో రుణ భిన్నాన్ని ధన భిన్నంగా పరిగణించారు. సంఖ్యా రేఖపై రుణ సంఖ్యలు ఎడమవైపుకు, ధన సంఖ్యలు కుడివైపుకు కదులుతాయి.",
        "hint_en": "Keep the negative sign attached to the numerator when finding common denominators: (-3/4) = (-3)/4.",
        "hint_te": "ఉమ్మడి హారం కనుగొనేటప్పుడు రుణ గుర్తును లవంతో పాటు ఉంచండి: (-3/4) = (-3)/4.",
        "analogy_en": "If you owe ₹3 and earn ₹2, you still owe ₹1 (-1), not ₹5!",
        "analogy_te": "మీరు ₹3 అప్పు ఉండి ₹2 సంపాదిస్తే, ఇంకా ₹1 అప్పు (-1) ఉంటుంది, ₹5 ఉండదు!"
    },
    "sign_slip": {
        "title_en": "Sign Slip in Directed Number Arithmetic",
        "title_te": "పూర్ణాంకాల గుర్తుల గణనలో పొరపాటు",
        "explanation_en": "Your fraction conversion method was correct, but a calculation slip happened during directed integer addition in the numerator.",
        "explanation_te": "మీ భిన్నాల మార్పిడి సరైనదే, కానీ లవంలోని రుణ/ధన సంఖ్యల కూడికలో చిన్న పొరపాటు జరిగింది.",
        "hint_en": "Check the sign of the larger absolute value: (-3) + (+2) = -1 because 3 is larger than 2.",
        "hint_te": "పెద్ద సంఖ్య గుర్తును గమనించండి: 3 కంటే 2 చిన్నది కాబట్టి (-3) + (+2) = -1 అవుతుంది.",
        "analogy_en": "Walking 3 steps backwards and 2 steps forward leaves you 1 step behind start (-1).",
        "analogy_te": "3 అడుగులు వెనక్కి నడిచి, 2 అడుగులు ముందుకు వేస్తే మీరు ప్రారంభ బిందువుకు 1 అడుగు వెనుక ఉంటారు (-1)."
    },
    "additive_equivalence": {
        "title_en": "Additive Scaling Misconception for Equivalent Fractions",
        "title_te": "సమాన భిన్నాలలో కూడిక ద్వారా పోలిక పొరపాటు",
        "explanation_en": "You added the same number to both numerator and denominator. Adding changes the fraction's actual ratio! Equivalent fractions require MULTIPLICATION or DIVISION by the same number.",
        "explanation_te": "లవానికి మరియు హారానికి ఒకే సంఖ్యను కూడారు. కూడటం వల్ల భిన్నం నిష్పత్తి మారుతుంది! సమాన భిన్నాల కోసం ఒకే సంఖ్యతో గుణించాలి లేదా భాగించాలి.",
        "hint_en": "Test it: 1/2 = 50%. If you add 1 to top and bottom, (1+1)/(2+1) = 2/3 = 66.7%! They are not equal.",
        "hint_te": "పరీక్షించండి: 1/2 అంటే 50%. లవహారాలకు 1 కూడితే 2/3 (66.7%) వస్తుంది. అవి సమానం కావు.",
        "analogy_en": "Multiplying expands slices without changing the shaded pie area. Adding changes the pie entirely.",
        "analogy_te": "గుణకారం భాగాలు పెంచుతుంది కానీ రంగు వేసిన పరిమాణాన్ని మార్చదు. కూడిక పరిమాణాన్నే మార్చేస్తుంది."
    },
    "reciprocal_confusion": {
        "title_en": "Confusing Reciprocal (Inversion) with Equivalence",
        "title_te": "వ్యుత్క్రమం (తిరగరాయడం) మరియు సమాన భిన్నాల మధ్య గందరగోళం",
        "explanation_en": "You inverted the fraction (e.g., flipped 2/3 into 3/2). That is a reciprocal, used in fraction division, not an equal value!",
        "explanation_te": "మీరు భిన్నాన్ని తిరగరాశారు (ఉదా. 2/3 ను 3/2 గా). ఇది వ్యుత్క్రమం, ఇది భాగహారంలో ఉపయోగపడుతుంది కానీ సమాన విలువ కాదు!",
        "hint_en": "2/3 is less than 1 whole. 3/2 is 1.5 (greater than 1 whole). They are opposites in size.",
        "hint_te": "2/3 అనేది 1 కంటే తక్కువ. 3/2 అంటే 1.5 (1 కంటే ఎక్కువ). అవి సమానం కావు.",
        "analogy_en": "A half cup of water is very different from two full cups of water!",
        "analogy_te": "సగం గ్లాసు నీరు మరియు రెండు పూర్తి గ్లాసుల నీరు సమానం కావు!"
    },
    "dropped_double_negative": {
        "title_en": "Subtracted Negative Rational as Negative Instead of Positive",
        "title_te": "రుణ సంఖ్యను తీసివేసేటప్పుడు గుర్తుల నియమం విస్మరించడం",
        "explanation_en": "Subtracting a negative quantity is equivalent to adding its positive opposite: a - (-b) = a + b.",
        "explanation_te": "రుణ సంఖ్యను తీసివేయడం అంటే దాని ధన విలువను కూడటంతో సమానం: a - (-b) = a + b.",
        "hint_en": "Rewrite double negatives as a plus sign: (-2/7) - (-3/7) becomes (-2 + 3)/7.",
        "hint_te": "రెండు రుణ గుర్తులు కలిసినప్పుడు కూడిక గుర్తుగా మార్చండి: (-2/7) - (-3/7) = (-2 + 3)/7.",
        "analogy_en": "Taking away a debt is the same as giving you cash!",
        "analogy_te": "ఒకరి అప్పును రద్దు చేయడం అంటే వారికి నగదు ఇవ్వడంతో సమానం!"
    },
    "simplification_cancel": {
        "title_en": "Illegal Cancellation Across Addition Terms",
        "title_te": "కూడికలో ఉన్న పదాలను నేరుగా కొట్టివేయడం",
        "explanation_en": "Common factors can only be cancelled across MULTIPLICATION, never across addition terms like (2+3)/(2+7).",
        "explanation_te": "గుణకారంలో ఉన్న కారణాంకాలను మాత్రమే కొట్టివేయవచ్చు, (2+3)/(2+7) వంటి కూడికలలో కాదు.",
        "hint_en": "Evaluate the numerator and denominator completely before reducing: (2+3)/(2+7) = 5/9.",
        "hint_te": "సరళీకరించే ముందు లవం మరియు హారాలను పూర్తిగా లెక్కించండి: (2+3)/(2+7) = 5/9.",
        "analogy_en": "You cannot remove half an engine from a car and expect the price ratio to stay the same.",
        "analogy_te": "మొత్తం లెక్కించకుండా మధ్యలోని సంఖ్యలను కొట్టివేయడం లెక్కను తప్పుదోవ పట్టిస్తుంది."
    },
    "mixed_to_improper": {
        "title_en": "Negative Sign Misplacement in Mixed Fraction Conversion",
        "title_te": "మిశ్రమ భిన్నాన్ని అపక్రమ భిన్నంగా మార్చేటప్పుడు గుర్తు పొరపాటు",
        "explanation_en": "For -2 1/3, the whole fraction is negative: - (2 + 1/3) = - (7/3) = -7/3, not (-2 × 3 + 1)/3 = -5/3.",
        "explanation_te": "-2 1/3 లో మొత్తం భిన్నం రుణ విలువను కలిగి ఉంటుంది: - (2 + 1/3) = - (7/3) = -7/3, -5/3 కాదు.",
        "hint_en": "Convert the positive mixed fraction first (2 1/3 = 7/3), then apply the negative sign to the entire result (-7/3).",
        "hint_te": "మొదట ధన మిశ్రమ భిన్నాన్ని మార్చండి (2 1/3 = 7/3), ఆపై మొత్తం ఫలితానికి రుణ గుర్తును చేర్చండి (-7/3).",
        "analogy_en": "Owing 2 whole cakes and 1 slice means owing 7 slices in total, not 5 slices.",
        "analogy_te": "2 పూర్తి కేకులు మరియు 1 ముక్క అప్పు ఉంటే మొత్తం 7 ముక్కలు అప్పు ఉన్నట్లు."
    }
}


def _get_rule_fallback(
    tag: str,
    stem: str = "",
    student_answer: str = "",
    lang: str = "en"
) -> Dict[str, Any]:
    """Provides instant, deterministic NCERT pedagogical explanation."""
    rule = PEDAGOGICAL_RULE_KNOWLEDGE_BASE.get(
        tag,
        {
            "title_en": "Conceptual Review",
            "title_te": "ప్రాథమిక సమీక్ష",
            "explanation_en": f"The answer '{student_answer}' indicates an opportunity to review the underlying rational number operations.",
            "explanation_te": f"మీ ఎంపిక '{student_answer}' అకరణీయ సంఖ్యల సూత్రాలను పునశ్చరణ చేయాల్సిన అవసరాన్ని సూచిస్తుంది.",
            "hint_en": "Break the problem down step-by-step and write out the common denominator.",
            "hint_te": "సమస్యను దశలవారీగా విభజించి ఉమ్మడి హారాన్ని రాయండి.",
            "analogy_en": "Visualizing fractions as equal partitions helps ensure correct slice sizes.",
            "analogy_te": "భిన్నాలను సమాన భాగాలుగా ఊహించుకోవడం సరైన పరిష్కారానికి సహాయపడుతుంది."
        }
    )

    is_te = lang == "te"
    title = rule["title_te"] if is_te else rule["title_en"]
    explanation = rule["explanation_te"] if is_te else rule["explanation_en"]
    hint = rule["hint_te"] if is_te else rule["hint_en"]
    analogy = rule["analogy_te"] if is_te else rule["analogy_en"]

    return {
        "status": "success",
        "source": "rule_based_fallback",
        "fallback_used": True,
        "fallback_reason": "Deterministic NCERT pedagogical rules engaged (zero latency / 100% offline-ready)",
        "tag": tag,
        "title": title,
        "explanation": explanation,
        "hint": hint,
        "analogy": analogy,
        "combined_message": f"{title}: {explanation}\n\n💡 Tip: {hint}\n🍰 Analogy: {analogy}"
    }


def generate_pedagogic_explanation(
    stem: str,
    student_answer: str,
    misconception_tag: str,
    topic: str = "Rational Numbers",
    lang: str = "en",
    timeout_sec: float = 3.5
) -> Dict[str, Any]:
    """
    Attempts to call Gemini API if key is configured, with strict timeout and retry.
    Gracefully and seamlessly falls back to deterministic rule engine upon any failure.
    """
    api_key = os.getenv("GEMINI_API_KEY") or GEMINI_API_KEY

    # If no key configured, immediately use deterministic rule engine
    if not api_key:
        return _get_rule_fallback(misconception_tag, stem, student_answer, lang)

    # Attempt Gemini API call
    target_lang = "Telugu" if lang == "te" else "English"
    prompt = (
        f"You are UDAAN's expert pedagogical math tutor for NCERT Class 8 Mathematics.\n"
        f"Topic: {topic}\n"
        f"Problem: {stem}\n"
        f"Student Answer: {student_answer}\n"
        f"Suspected Misconception: {misconception_tag}\n"
        f"Language: {target_lang}\n\n"
        f"Provide a short (under 75 words), encouraging, conceptual explanation that:\n"
        f"1. Acknowledges how the student thought about the problem without shaming.\n"
        f"2. Explains why this common mistake happens.\n"
        f"3. Gives a small conceptual hint or everyday analogy to guide them.\n"
        f"Do NOT give away the final answer."
    )

    request_payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 200
        }
    }

    url = f"{GEMINI_ENDPOINT}?key={api_key}"
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(request_payload).encode("utf-8"), headers=headers, method="POST")

    # Retry logic (max 1 retry)
    for attempt_num in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                if resp.status == 200:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    candidates = resp_data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            ai_text = parts[0]["text"].strip()
                            rule_info = PEDAGOGICAL_RULE_KNOWLEDGE_BASE.get(misconception_tag, {})
                            title = rule_info.get(f"title_{lang}", "Personalized AI Guidance")
                            hint = rule_info.get(f"hint_{lang}", "Review the common denominator.")
                            return {
                                "status": "success",
                                "source": "gemini_api",
                                "fallback_used": False,
                                "tag": misconception_tag,
                                "title": title,
                                "explanation": ai_text,
                                "hint": hint,
                                "combined_message": f"{title}\n\n{ai_text}"
                            }
        except Exception as ex:
            logger.warning(f"Gemini API attempt {attempt_num + 1} failed: {ex}. Falling back to rule engine.")

    # Fallback if API fails or times out
    return _get_rule_fallback(misconception_tag, stem, student_answer, lang)
