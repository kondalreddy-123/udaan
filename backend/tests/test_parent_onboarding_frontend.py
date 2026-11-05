"""
Phase 3 frontend guard tests.

These are static assertions, not a browser suite. They protect the accessibility
and graceful-degradation requirements that are easy to regress during UI edits:
 - voice is always optional and speech recognition is feature-detected
 - the large yes/no buttons remain the non-voice path
 - progress and labels are exposed to assistive technology
 - Telugu, English and Hindi are all present in the translation catalogue
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"


def _read(relative_path: str) -> str:
    path = FRONTEND_SRC / relative_path
    assert path.exists(), f"Expected frontend file at {path}"
    return path.read_text(encoding="utf-8")


def test_voice_onboarding_falls_back_without_speech_support():
    source = _read("components/ParentOnboarding.jsx")

    # Feature detection for recognition, not an unconditional constructor.
    assert "window.SpeechRecognition || window.webkitSpeechRecognition" in source
    assert "if (!SpeechRecognition)" in source
    assert "recognitionSupported" in source

    # TTS is feature-detected too; absence must not block registration.
    assert "'speechSynthesis' in window" in source

    # Always-available touch path: yes/no controls plus the invite-code form.
    assert 'className="po-yes"' in source
    assert 'className="po-no"' in source
    assert 'className="po-mic' in source
    assert "enterCodeTitle" in source

    # No raw audio recording or voice biometrics are stored/uploaded.
    assert "MediaRecorder" not in source
    assert "getUserMedia" not in source


def test_onboarding_progress_and_labels_are_accessible():
    source = _read("components/ParentOnboarding.jsx")

    assert 'role="progressbar"' in source
    assert "aria-valuenow" in source
    assert 'role="dialog"' in source
    assert 'aria-modal="true"' in source
    assert "aria-live" in source
    assert "aria-pressed" in source
    assert "aria-label" in source
    assert 'role="alert"' in source


def test_three_supported_languages_are_translated():
    source = _read("i18n/translations.js")

    # Three language catalogues.
    for header in ("en: {", "te: {", "hi: {"):
        assert header in source

    # Key parent-onboarding strings must exist in all three catalogues.
    for key in (
        "parentWelcome",
        "chooseHow",
        "teacherHelp",
        "inviteCode",
        "voiceHelp",
        "invitationPrivacyNote",
        "pendingVerification",
    ):
        occurrences = source.count(f"{key}:")
        assert occurrences >= 3, f"Expected '{key}' in en/te/hi, found {occurrences}"
