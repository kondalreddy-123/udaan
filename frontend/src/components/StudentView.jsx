import React, { useState, useEffect } from 'react';
import Cube3D from './Cube3D';
import MasteryCrystal from './MasteryCrystal';
import ParentConnect from './ParentConnect';
import MyLearningPlan from './MyLearningPlan';
import { api } from '../services/api';

export default function StudentView({
  concepts,
  mastery,
  ruleState,
  bktState,
  queue,
  syncedCount,
  history,
  cfg,
  lang,
  t,
  lowBandwidth,
  currentUser,
  onAnswerPractice,
  onLaunchDetective,
  onOpenTour,
  onSyncNow,
  onNavigateTab
}) {
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [showHint, setShowHint] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [simulatedPathOverride, setSimulatedPathOverride] = useState(null);
  
  // Real Student Profile State from Backend API
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Parent invitation state (Phase 3)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [newInvite, setNewInvite] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [parentConnectOpen, setParentConnectOpen] = useState(false);
  const isStudent = currentUser?.role === 'student';

  // Phase 5: Student-side parent connection management (approve / reject / revoke)
  const [parentConnections, setParentConnections] = useState([]);
  const [parentConnBusy, setParentConnBusy] = useState(false);
  const [parentConnMsg, setParentConnMsg] = useState('');
  const [parentConnErr, setParentConnErr] = useState('');
  const [showRevocationModal, setShowRevocationModal] = useState(false);
  const [revocationBusy, setRevocationBusy] = useState(false);
  const [revocationInfo, setRevocationInfo] = useState(null);
  const [parentSearchQ, setParentSearchQ] = useState('');

  // Teacher Search state (Part 6)
  const [teacherSearchQ, setTeacherSearchQ] = useState('');
  const [teacherResults, setTeacherResults] = useState([]);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [selectedTeacherModal, setSelectedTeacherModal] = useState(null);

  const loadParentConnections = async () => {
    if (!isStudent) return;
    try {
      const data = await api.getStudentParentConnections();
      setParentConnections(Array.isArray(data) ? data : []);
    } catch (_) {
      // non-fatal
    }
  };

  const activeParentConn = parentConnections.find((c) => c.status === 'verified') || null;
  const pendingParentConn = parentConnections.find((c) => c.status === 'pending') || null;
  const parentAccessLocked = Boolean(activeParentConn || pendingParentConn);
  const parentAccessHistory = parentConnections.filter(
    (c) => !['pending', 'verified'].includes(c.status)
  );

  useEffect(() => {
    if (isStudent) loadParentConnections();
  }, [isStudent]);

  const handleApproveParentConn = async (linkId) => {
    setParentConnBusy(true);
    setParentConnMsg('');
    setParentConnErr('');
    try {
      await api.approveParentConnection(linkId);
      setParentConnMsg('Connection approved! The parent can now view your progress.');
      await loadParentConnections();
    } catch (err) {
      setParentConnErr(err.message || 'Could not approve connection.');
    } finally {
      setParentConnBusy(false);
    }
  };

  const handleRejectParentConn = async (linkId) => {
    if (!window.confirm('Reject this parent connection request?')) return;
    setParentConnBusy(true);
    setParentConnMsg('');
    setParentConnErr('');
    try {
      await api.rejectParentConnection(linkId);
      setParentConnMsg('Connection request rejected.');
      await loadParentConnections();
    } catch (err) {
      setParentConnErr(err.message || 'Could not reject request.');
    } finally {
      setParentConnBusy(false);
    }
  };

  const handleRequestRevocation = async (linkId) => {
    setRevocationBusy(true);
    setParentConnErr('');
    setParentConnMsg('');
    try {
      const res = await api.requestParentRevocation(linkId);
      setRevocationInfo(res);
      setParentConnMsg(res.message || 'Removal OTP sent to parent registered email.');
      setShowRevocationModal(false);
      await loadParentConnections();
    } catch (err) {
      setParentConnErr(err.message || 'Could not send removal request.');
    } finally {
      setRevocationBusy(false);
    }
  };

  const handleTeacherSearch = async (query) => {
    setTeacherSearchQ(query);
    setTeacherLoading(true);
    try {
      const res = await api.searchStudentTeachers(query);
      setTeacherResults(res?.results || []);
    } catch (_) {
      setTeacherResults([]);
    } finally {
      setTeacherLoading(false);
    }
  };

  useEffect(() => {
    if (isStudent) {
      handleTeacherSearch('');
    }
  }, [isStudent]);

  const handleRevokeParentConn = async (linkId, parentName) => {
    if (!window.confirm(`Revoke access for ${parentName}? They will no longer receive weekly reports.`)) return;
    setParentConnBusy(true);
    setParentConnMsg('');
    setParentConnErr('');
    try {
      await api.revokeParentConnection(linkId);
      setParentConnMsg(`Access for ${parentName} has been revoked.`);
      await loadParentConnections();
    } catch (err) {
      setParentConnErr(err.message || 'Could not revoke access.');
    } finally {
      setParentConnBusy(false);
    }
  };

  // Audio / Speech State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');

  // Fetch real student profile on mount and update
  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const data = await api.getStudentProfile();
      if (data) setProfile(data);
    } catch (err) {
      // Offline fallback: continue smoothly with local states
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [practiceIdx, syncedCount]);

  // --- Phase 3: student-generated parent invitations ---
  const loadInvitations = async () => {
    try {
      setInviteLoading(true);
      setInviteError('');
      const data = await api.getParentInvitations();
      setInvitations(Array.isArray(data) ? data : []);
    } catch (err) {
      setInviteError(err.message || 'Could not load invitations.');
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    if (inviteOpen && isStudent) loadInvitations();
  }, [inviteOpen, isStudent]);

  const handleCreateInvite = async () => {
    setInviteError('');
    setInviteCopied(false);
    try {
      setInviteLoading(true);
      const data = await api.createParentInvitation({
        relationship_type: 'parent',
        preferred_language: ['te', 'en', 'hi'].includes(lang) ? lang : 'te'
      });
      setNewInvite(data);
      setInvitations((prev) => [data, ...prev]);
    } catch (err) {
      setInviteError(err.message || 'Could not create an invitation. Please wait a moment and try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInvite = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch (e) {
      setInviteError('Could not copy automatically. Please read the code and write it down.');
    }
  };

  const handleRevokeInvite = async (id) => {
    if (!window.confirm('Cancel this invitation code? It will stop working immediately.')) return;
    try {
      setInviteLoading(true);
      await api.revokeParentInvitation(id);
      setInvitations((prev) => prev.map((inv) => (inv.id === id ? { ...inv, is_revoked: true } : inv)));
      if (newInvite && newInvite.id === id) setNewInvite(null);
    } catch (err) {
      setInviteError(err.message || 'Could not cancel this invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  const inviteStatus = (inv) => {
    if (inv.is_redeemed) return 'Used ✓';
    if (inv.is_revoked) return 'Cancelled';
    if (inv.is_expired || new Date(inv.expires_at) < new Date()) return 'Expired';
    return 'Active';
  };

  const allPracticeQuestions = [
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'అకరణీయ సంఖ్యల సంకలనం',
      stem_en: '(-1/2) + (1/4) = ?',
      stem_te: 'గణించండి: (-1/2) + (1/4) = ?',
      tier: 'foundational',
      hint_en: 'Find the LCM of 2 and 4 to equalize the denominators.',
      hint_te: 'హారాలను సమానం చేయడానికి 2 మరియు 4 ల క.సా.గు కనుగొనండి.',
      options: [
        { text: '-1/4', correct: true, exp_en: 'Correct! -2/4 + 1/4 = -1/4.', exp_te: 'సరైనది! -2/4 + 1/4 = -1/4.' },
        { text: '-2/6', correct: false, exp_en: 'Added numerators & denominators separately.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కూడారు.' },
        { text: '3/4', correct: false, exp_en: 'Dropped the negative sign.', exp_te: 'రుణ గుర్తును విస్మరించారు.' },
        { text: '1/4', correct: false, exp_en: 'Calculation sign slip (+1/4 instead of -1/4).', exp_te: 'గుర్తు గణనలో పొరపాటు.' }
      ]
    },
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'అకరణీయ సంఖ్యల సంకలనం',
      stem_en: '(-5/6) + (1/3) = ?',
      stem_te: 'గణించండి: (-5/6) + (1/3) = ?',
      tier: 'guided',
      hint_en: 'The LCM of 6 and 3 is 6. Convert 1/3 to 2/6.',
      hint_te: '6 మరియు 3 ల క.సా.గు 6. 1/3 ను 2/6 గా మార్చండి.',
      options: [
        { text: '-1/2', correct: true, exp_en: 'Correct! -5/6 + 2/6 = -3/6 = -1/2.', exp_te: 'సరైనది! -5/6 + 2/6 = -3/6 = -1/2.' },
        { text: '-4/9', correct: false, exp_en: 'Added tops & bottoms separately (-5+1)/(6+3).', exp_te: 'లవాలు హారాలు విడివిడిగా కూడారు.' },
        { text: '-7/6', correct: false, exp_en: 'Subtracted instead of adding.', exp_te: 'కూడటానికి బదులుగా తీసివేత చేశారు.' },
        { text: '1/6', correct: false, exp_en: 'Sign error.', exp_te: 'గుర్తు లోపం.' }
      ]
    },
    {
      topic: 'c2',
      topic_name_en: 'Equivalent Fractions & LCM',
      topic_name_te: 'సమాన భిన్నాలు & క.సా.గు',
      stem_en: 'Which fraction is equivalent to 3/4?',
      stem_te: '3/4 కు సమానమైన భిన్నం ఏది?',
      tier: 'guided',
      hint_en: 'Multiply both numerator and denominator by the same non-zero integer.',
      hint_te: 'లవం మరియు హారం రెండింటినీ ఒకే సంఖ్యతో గుణించండి.',
      options: [
        { text: '9/12', correct: true, exp_en: 'Correct! (3×3)/(4×3) = 9/12.', exp_te: 'సరైనది! (3×3)/(4×3) = 9/12.' },
        { text: '5/6', correct: false, exp_en: 'Added 2 to top and bottom (3+2)/(4+2) = 5/6.', exp_te: 'లవానికి హారానికి 2 కూడారు.' },
        { text: '4/3', correct: false, exp_en: 'Inverted the fraction (reciprocal).', exp_te: 'భిన్నాన్ని తిరగరాశారు (వ్యుత్క్రమం).' },
        { text: '3/8', correct: false, exp_en: 'Doubled denominator only.', exp_te: 'హారాన్ని మాత్రమే రెట్టింపు చేశారు.' }
      ]
    },
    {
      topic: 'c4',
      topic_name_en: 'Signed Rationals & Number Line',
      topic_name_te: 'రుణ అకరణీయ సంఖ్యలు & సంఖ్యా రేఖ',
      stem_en: 'Evaluate: (-2/5) - (-1/5) = ?',
      stem_te: 'గణించండి: (-2/5) - (-1/5) = ?',
      tier: 'guided',
      hint_en: 'Subtracting a negative number is equivalent to adding: a - (-b) = a + b.',
      hint_te: 'రుణ సంఖ్యను తీసివేయడం అంటే కూడటమే: a - (-b) = a + b.',
      options: [
        { text: '-1/5', correct: true, exp_en: 'Correct! -2/5 + 1/5 = -1/5.', exp_te: 'సరైనది! -2/5 + 1/5 = -1/5.' },
        { text: '-3/5', correct: false, exp_en: 'Dropped double negative rule: -2 - 1 = -3.', exp_te: 'గుర్తు నియమాన్ని విస్మరించి -2 - 1 = -3 చేశారు.' },
        { text: '1/5', correct: false, exp_en: 'Calculation sign slip.', exp_te: 'గణనలో గుర్తు పొరపాటు.' },
        { text: '3/5', correct: false, exp_en: 'Dropped all negatives.', exp_te: 'అన్ని గుర్తులను తొలగించారు.' }
      ]
    },
    {
      topic: 'c6',
      topic_name_en: 'Multiplication & Division of Rationals',
      topic_name_te: 'అకరణీయ సంఖ్యల గుణకారం & భాగహారం',
      stem_en: '(2/3) ÷ (4/5) = ?',
      stem_te: 'గణించండి: (2/3) ÷ (4/5) = ?',
      tier: 'independent',
      hint_en: 'Multiply by the reciprocal of the second fraction.',
      hint_te: 'రెండవ భిన్నం యొక్క వ్యుత్క్రమంతో గుణించండి.',
      options: [
        { text: '5/6', correct: true, exp_en: 'Correct! (2/3) × (5/4) = 10/12 = 5/6.', exp_te: 'సరైనది! (2/3) × (5/4) = 10/12 = 5/6.' },
        { text: '8/15', correct: false, exp_en: 'Multiplied straight across without reciprocating.', exp_te: 'తిరగరాయకుండా నేరుగా గుణించారు.' },
        { text: '6/5', correct: false, exp_en: 'Inverted first fraction instead of divisor.', exp_te: 'మొదటి భిన్నాన్ని తిరగరాశారు.' },
        { text: '2/5', correct: false, exp_en: 'Arithmetic mistake.', exp_te: 'గణన లోపం.' }
      ]
    },
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'భిన్నాలను కలపడం',
      stem_en: '(1/2) + (1/4) = ?',
      stem_te: 'గణించండి: (1/2) + (1/4) = ?',
      tier: 'foundational',
      hint_en: 'The LCM of 2 and 4 is 4. Rewrite 1/2 as 2/4.',
      hint_te: '2 మరియు 4 యొక్క క.సా.గు 4. 1/2 ను 2/4గా మార్చండి.',
      options: [
        { text: '3/4', correct: true, exp_en: 'Correct! 2/4 + 1/4 = 3/4.', exp_te: 'సరైనది! 2/4 + 1/4 = 3/4.' },
        { text: '2/6', correct: false, exp_en: 'Added numerators and denominators separately.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కలిపారు.' },
        { text: '1/6', correct: false, exp_en: 'Subtracted instead of adding.', exp_te: 'కలపడానికి బదులు తీసివేశారు.' },
        { text: '2/4', correct: false, exp_en: 'Stopped before adding the numerators.', exp_te: 'లవాలను కలపకుండా ఆగిపోయారు.' }
      ]
    },
    {
      topic: 'c4',
      topic_name_en: 'Signed Rationals & Number Line',
      topic_name_te: 'సంజ్ఞా భిన్నాలు & సంఖ్యా రేఖ',
      stem_en: 'Evaluate: (-1/3) + (1/3) = ?',
      stem_te: 'గణించండి: (-1/3) + (1/3) = ?',
      tier: 'foundational',
      hint_en: 'Equal denominators with opposite numerators cancel out.',
      hint_te: 'సమాన హారాలు, వ్యతిరేక లవాలు ఉన్నప్పుడు ఫలితం సున్నా.',
      options: [
        { text: '0', correct: true, exp_en: 'Correct! -1/3 + 1/3 = 0.', exp_te: 'సరైనది! -1/3 + 1/3 = 0.' },
        { text: '-2/3', correct: false, exp_en: 'Added the numerators without using opposite signs.', exp_te: 'వ్యతిరేక సంజ్ఞలను పరిగణించకుండా లవాలను కలిపారు.' },
        { text: '2/3', correct: false, exp_en: 'Changed both signs to positive.', exp_te: 'రెండు సంజ్ఞలను ధనాత్మకం చేశారు.' },
        { text: '-1/6', correct: false, exp_en: 'Added denominators as well.', exp_te: 'హారాలను కూడా కలిపారు.' }
      ]
    },
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'భిన్నాలను కలపడం',
      stem_en: '(-7/8) + (1/2) = ?',
      stem_te: 'గణించండి: (-7/8) + (1/2) = ?',
      tier: 'independent',
      hint_en: 'The LCM of 8 and 2 is 8. Rewrite 1/2 as 4/8.',
      hint_te: '8 మరియు 2 యొక్క క.సా.గు 8. 1/2 ను 4/8గా మార్చండి.',
      options: [
        { text: '-3/8', correct: true, exp_en: 'Correct! -7/8 + 4/8 = -3/8.', exp_te: 'సరైనది! -7/8 + 4/8 = -3/8.' },
        { text: '-6/10', correct: false, exp_en: 'Added numerators and denominators separately.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కలిపారు.' },
        { text: '-5/8', correct: false, exp_en: 'Subtracted 2/8 instead of adding 4/8.', exp_te: '4/8 కలపకుండా 2/8 తీసివేశారు.' },
        { text: '1/8', correct: false, exp_en: 'Ignored the negative sign on 7/8.', exp_te: '7/8 పై ఋణ సంజ్ఞను పరిగణించలేదు.' }
      ]
    },
    {
      topic: 'c2',
      topic_name_en: 'Equivalent Fractions & LCM',
      topic_name_te: 'సమాన భిన్నాలు & క.సా.గు',
      stem_en: 'Which fraction is equivalent to 6/8?',
      stem_te: '6/8 కు సమానమైన భిన్నం ఏది?',
      tier: 'independent',
      hint_en: 'Divide both numerator and denominator by the same common factor.',
      hint_te: 'లవం మరియు హారం రెండింటినీ ఒకే సామాన్య కారకంతో భాగించండి.',
      options: [
        { text: '3/4', correct: true, exp_en: 'Correct! 6/8 ÷ 2/2 = 3/4.', exp_te: 'సరైనది! 6/8 ÷ 2/2 = 3/4.' },
        { text: '9/10', correct: false, exp_en: 'Added 3 to the numerator and 2 to the denominator.', exp_te: 'లవానికి 3, హారానికి 2 కలిపారు.' },
        { text: '6/10', correct: false, exp_en: 'Changed only the denominator.', exp_te: 'హారాన్ని మాత్రమే మార్చారు.' },
        { text: '4/3', correct: false, exp_en: 'Inverted the fraction.', exp_te: 'భిన్నాన్ని తలకిందులు చేశారు.' }
      ]
    }
  ];

  // Adaptive difficulty: the backend BKT/rule engine stores a per-concept
  // rule_level (1 foundational, 2 guided, 3 independent). The practice pool is
  // filtered to the learner's current level so high, average and low performers
  // receive different question tiers instead of one fixed set.
  const conceptRuleLevel = (() => {
    const conceptRows = profile?.concepts || [];
    if (selectedTopic && selectedTopic !== 'all') {
      const current = conceptRows.find((c) => c.concept_id === selectedTopic);
      return current?.rule_level || 1;
    }
    const attempted = conceptRows.filter((c) => (c.attempts_count || 0) > 0);
    if (attempted.length === 0) return 1;
    const avg = attempted.reduce((sum, c) => sum + (c.rule_level || 1), 0) / attempted.length;
    return Math.min(3, Math.max(1, Math.round(avg)));
  })();
  const adaptiveTier = conceptRuleLevel >= 3 ? 'independent' : conceptRuleLevel === 2 ? 'guided' : 'foundational';
  const topicQuestions = allPracticeQuestions.filter(
    (q) => selectedTopic === 'all' || q.topic === selectedTopic
  );
  const tierQuestions = topicQuestions.filter((q) => q.tier === adaptiveTier);
  const tierOrder = { foundational: 1, guided: 2, independent: 3 };
  const nearestTierQuestions = topicQuestions.length > 0
    ? topicQuestions.filter(
        (q) => q.tier === topicQuestions
          .map((item) => item.tier)
          .sort((a, b) => Math.abs(tierOrder[a] - tierOrder[adaptiveTier]) - Math.abs(tierOrder[b] - tierOrder[adaptiveTier]))[0]
      )
    : [];
  const filteredPracticeQuestions = tierQuestions.length > 0 ? tierQuestions : nearestTierQuestions;
  const effectiveTier = tierQuestions.length > 0
    ? adaptiveTier
    : (nearestTierQuestions[0]?.tier || adaptiveTier);
  const tierAdjusted = effectiveTier !== adaptiveTier;

  const practiceQuestions = filteredPracticeQuestions.length > 0 ? filteredPracticeQuestions : allPracticeQuestions;
  const currentQ = practiceQuestions[practiceIdx % practiceQuestions.length];

  // Text-To-Speech (Read Aloud) Helper
  const handleReadAloud = (textToSpeak) => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = lang === 'te' ? 'te-IN' : 'en-IN';
    utterance.rate = 0.92;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Speech-To-Text (Voice Input) Helper
  const handleVoiceInput = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition is not supported on this browser. Try Google Chrome or Edge.');
      return;
    }

    if (isListening) return;

    try {
      const recognition = new SpeechRec();
      recognition.lang = lang === 'te' ? 'te-IN' : 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice(t('listening'));
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        setVoiceNotice(`Heard: "${transcript}"`);

        // Check if student spoke an option (Option A, B, C, D or text)
        let matchedOpt = null;
        if (transcript.includes('option a') || transcript === 'a' || transcript === 'one') matchedOpt = currentQ.options[0];
        else if (transcript.includes('option b') || transcript === 'b' || transcript === 'two') matchedOpt = currentQ.options[1];
        else if (transcript.includes('option c') || transcript === 'c' || transcript === 'three') matchedOpt = currentQ.options[2];
        else if (transcript.includes('option d') || transcript === 'd' || transcript === 'four') matchedOpt = currentQ.options[3];
        else {
          matchedOpt = currentQ.options.find(o => transcript.includes(o.text.toLowerCase()));
        }

        if (matchedOpt) {
          handlePick(matchedOpt);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setVoiceNotice('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setTimeout(() => setVoiceNotice(''), 3000);
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handlePick = (opt) => {
    setSelectedOption(opt.text);
    const isCorrect = opt.correct;
    const expText = lang === 'te' ? (opt.exp_te || opt.exp_en) : opt.exp_en;

    setFeedback({
      isCorrect,
      exp: expText
    });

    onAnswerPractice('c5', isCorrect);

    setTimeout(() => {
      setSelectedOption(null);
      setFeedback(null);
      setPracticeIdx((prev) => prev + 1);
      fetchProfile();
    }, 1800);
  };

  // Live Metrics (prioritize backend profile, fallback to props)
  const c5Rule = ruleState.c5 || { lvl: 1, sc: 0, sw: 0, path: 'Focused practice', reason: 'Baseline initialized' };
  const c5Score = profile?.concepts?.find(c => c.concept_id === 'c5')?.mastery_score ?? (mastery.c5 !== undefined ? mastery.c5 : 0.25);
  const c5ScorePct = Math.round(c5Score * 100);

  const streakDays = profile?.streak_days ?? 5;
  const overallMasteryPct = profile?.overall_mastery_pct ?? Math.round(
    (Object.values(mastery).reduce((a, b) => a + (b || 0), 0) / (Object.values(mastery).length || 1)) * 100
  );

  const dailyGoal = profile?.daily_goal ?? { target: 5, completed: (practiceIdx % 5) + 1, percent: Math.min(100, ((practiceIdx % 5) + 1) * 20) };
  const roadmapItems = profile?.roadmap ?? [
    { concept_id: 'c0', title_en: 'Integers & Directed Numbers', title_te: 'పూర్ణాంకాలు & సంఖ్యా రేఖ', status: 'completed', status_label: 'Mastered', mastery_pct: 80 },
    { concept_id: 'c1', title_en: 'Fractions & Equivalent Forms', title_te: 'భిన్నాలు & సమాన రూపాలు', status: 'in_progress', status_label: 'In Progress', mastery_pct: 50 },
    { concept_id: 'c2', title_en: 'LCM & Common Denominators', title_te: 'క.సా.గు & ఉమ్మడి హారాలు', status: 'needs_practice', status_label: 'Needs Practice', mastery_pct: 40 },
    { concept_id: 'c3', title_en: 'Rational Meaning (p/q, q≠0)', title_te: 'అకరణీయ సంఖ్యల నిర్వచనం', status: 'in_progress', status_label: 'In Progress', mastery_pct: 60 },
    { concept_id: 'c4', title_en: 'Comparing Rational Numbers', title_te: 'అకరణీయ సంఖ్యల పోలిక', status: 'needs_practice', status_label: 'Needs Practice', mastery_pct: 30 },
    { concept_id: 'c5', title_en: 'Adding Rationals (Unlike Denominators)', title_te: 'వేర్వేరు హారాలు గల కూడిక', status: 'needs_practice', status_label: 'Active Target', mastery_pct: c5ScorePct },
    { concept_id: 'c6', title_en: 'Multiplication & Division of Rationals', title_te: 'గుణకారం & భాగహారం', status: 'upcoming', status_label: 'Upcoming', mastery_pct: 10 },
  ];

  const recommended = profile?.recommended_learning ?? {
    concept_id: 'c5',
    title_en: 'Adding Rationals with Unlike Denominators',
    title_te: 'వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక',
    why_recommended: 'Prerequisite equivalent fractions is established. Practice finding LCMs to master unlike denominators.',
    estimated_time_mins: 12,
    recommended_difficulty: 'Tier 1: Foundational Scaffolding'
  };

  const badges = profile?.badges ?? [
    { id: 'first_5', name_en: 'Curious Explorer', name_te: 'పరిశోధకుడు', desc_en: 'Completed your first 5 exercises!', earned: true },
    { id: 'streak_3', name_en: '3-Day Streak', name_te: '3 రోజుల వరుస', desc_en: 'Learned 3 days in a row!', earned: true },
    { id: 'streak_7', name_en: 'Week Warrior', name_te: 'వారం యోధుడు', desc_en: '7-day learning streak!', earned: false }
  ];

  // Adaptive Pacing Tiers
  const thrFoundation = cfg.pacingFoundation || 40;
  const thrGuided = cfg.pacingGuided || 70;
  const thrIndependent = cfg.pacingIndependent || 85;

  let activePathId = 'normal';
  if (c5ScorePct < thrFoundation || c5Rule.sw >= 2 || c5Rule.path.includes('prerequisite') || c5Rule.path.includes('teacher')) {
    activePathId = 'struggling';
  } else if (c5ScorePct >= thrIndependent || c5Rule.sc >= 3 || c5Rule.path.includes('Harder')) {
    activePathId = 'advanced';
  }

  if (simulatedPathOverride) {
    activePathId = simulatedPathOverride;
  }

  const divergentPaths = {
    struggling: {
      id: 'struggling',
      title: 'Remedial & Tactile Scaffolding Path',
      color: '#fb923c',
      badgeClass: 'warn',
      icon: '🛡️',
      currentActivity: 'Tactile Partition Slices (1/4 scale) + LCM Number Line',
      scaffoldingLevel: 'High Scaffolding (Automatic Step-by-Step Breakdown)',
      why: `Concept c5 mastery is ${c5ScorePct}% (< ${thrFoundation}%). Foundational tactile review activated.`
    },
    normal: {
      id: 'normal',
      title: 'Standard Guided Progression Path',
      color: '#00f2fe',
      badgeClass: 'good',
      icon: '🚀',
      currentActivity: 'Multi-Step Rational Addition with On-Demand Hints',
      scaffoldingLevel: 'Medium Scaffolding (On-Demand Visualizer Hints)',
      why: `Concept c5 mastery is ${c5ScorePct}%. Learner demonstrates steady progress.`
    },
    advanced: {
      id: 'advanced',
      title: 'Advanced Mastery & Extension Path',
      color: '#10b981',
      badgeClass: 'good',
      icon: '⭐',
      currentActivity: 'Rational Algebraic Equations & Real-World Modeling',
      scaffoldingLevel: 'Independent (Timed Accuracy Benchmark)',
      why: `Concept c5 mastery is ${c5ScorePct}% (≥ ${thrIndependent}%). Ready for curriculum acceleration.`
    }
  };

  const currentPath = divergentPaths[activePathId];

  return (
    <div>
      {/* 1. STUDENT PROFILE COMMAND CENTER BANNER WITH AI COMPANION */}
      <section
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 17, 22, 0.94) 0%, rgba(10, 13, 20, 0.98) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          padding: '24px 28px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: '24px'
          }}
        >
          {/* Student Character Avatar (Indian student, blue hoodie & backpack) */}
          <div
            style={{
              position: 'relative',
              width: '84px',
              height: '84px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #8a4bff 100%)',
              padding: '2px',
              boxShadow: '0 0 25px rgba(0, 242, 254, 0.4)',
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '22px',
                background: '#07080a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {!lowBandwidth ? (
                <img
                  src="/assets/cinematic/clip4_frame001.jpg"
                  alt="Aarav Sharma - Student Navigator"
                  style={{
                    width: '180%',
                    height: '180%',
                    objectFit: 'cover',
                    objectPosition: '42% 16%'
                  }}
                />
              ) : (
                <span style={{ fontSize: '2.4rem' }}>🧑‍🎓</span>
              )}
            </div>
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: '#10b981',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                border: '2.5px solid #07080a',
                boxShadow: '0 0 8px #10b981'
              }}
              title="Online Active"
            />
          </div>

          {/* Student Welcome & Bio */}
          <div>
            <div className="row" style={{ gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 900 }}>
                {lang === 'te' ? 'నమస్కారం,' : 'Welcome back,'} <span className="glow-cyan">{profile?.full_name || 'Aarav Sharma'}!</span>
              </h1>
              <span className="tag purple">NCERT CLASS 8 · SEC A</span>
              <span className="tag good">{streakDays} {t('streak')} 🔥</span>
              {lowBandwidth && <span className="tag warn">{t('dataSaverOn')}</span>}
            </div>
            <p className="mu" style={{ margin: 0, maxWidth: '640px', fontSize: '0.92rem', lineHeight: '1.4' }}>
              {t('sub')}
            </p>
          </div>

          {/* Floating Translucent Spherical AI Companion Guide */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(0, 242, 254, 0.08)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '18px',
              padding: '10px 16px',
              maxWidth: '310px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0, 242, 254, 0.9) 0%, rgba(138, 75, 255, 0.6) 70%, transparent 100%)',
                boxShadow: '0 0 16px rgba(0, 242, 254, 0.8)',
                flexShrink: 0,
                animation: 'pulse 2.5s infinite ease-in-out'
              }}
            />
            <div>
              <div style={{ fontSize: '0.78rem', color: '#00f2fe', fontWeight: 800, textTransform: 'uppercase' }}>
                {t('aiGuidance')}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#f8fafc', fontWeight: 600 }}>
                {lang === 'te'
                  ? '“ప్రతి తప్పు సమాధానంలో ఒక కొత్త ఆలోచన దాగి ఉంటుంది. మనం కలిసి నేర్చుకుందాం!”'
                  : '“Every mistake tells us how you think. Let’s decode it together!”'}
              </div>
            </div>
          </div>
        </div>

        {/* Learning Overview Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginTop: '22px',
            paddingTop: '18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          {/* Progress metric */}
          <div>
            <div className="row spaced" style={{ fontSize: '0.82rem', marginBottom: '4px' }}>
              <span className="mu">{t('overallProgress')}</span>
              <b style={{ color: '#00f2fe' }}>{overallMasteryPct}%</b>
            </div>
            <div className="bar" style={{ height: '8px' }}>
              <i style={{ width: `${overallMasteryPct}%`, background: 'linear-gradient(90deg, #00f2fe, #8a4bff)' }} />
            </div>
          </div>

          {/* Daily Goal */}
          <div>
            <div className="row spaced" style={{ fontSize: '0.82rem', marginBottom: '4px' }}>
              <span className="mu">{t('dailyGoal')}</span>
              <b style={{ color: dailyGoal.completed >= dailyGoal.target ? '#10b981' : '#fb923c' }}>
                {dailyGoal.completed} / {dailyGoal.target} {dailyGoal.completed >= dailyGoal.target ? '✓' : ''}
              </b>
            </div>
            <div className="bar" style={{ height: '8px' }}>
              <i
                style={{
                  width: `${Math.min(100, (dailyGoal.completed / dailyGoal.target) * 100)}%`,
                  background: dailyGoal.completed >= dailyGoal.target ? '#10b981' : '#fb923c'
                }}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="row" style={{ gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button className="pri" onClick={onLaunchDetective} style={{ padding: '8px 14px', fontSize: '0.86rem' }}>
              🔍 {t('start')}
            </button>
            <button onClick={onOpenTour} className="sec" style={{ padding: '8px 12px', fontSize: '0.86rem' }}>
              ▶ Guided Tour
            </button>
          </div>
        </div>
      </section>

      {/* PHASE 3 + PHASE 5: two clearly separated parent setup options */}
      {isStudent && (
        <section className="card" style={{ marginTop: '20px', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
          <div style={{ marginBottom: '14px' }}>
            <span className="tag good">FAMILY LINK & WEEKLY REPORTS</span>
            <h3 style={{ margin: '6px 0 4px', fontSize: '1.15rem' }}>
              👨‍👩‍👧 Parent access
            </h3>
            <p className="mu" style={{ margin: 0, fontSize: '0.86rem', maxWidth: '720px' }}>
              Choose one option. Both keep teacher verification and existing parent login rules unchanged.
            </p>
          </div>

          <div className="pc-option-grid">
            <div className="pc-option-card">
              <span className="tag purple">OPTION 1</span>
              <h4>{t('pcOption1Title')}</h4>
              <p className="mu">{t('pcOption1Body')}</p>
              <button
                className="pri"
                disabled={parentAccessLocked}
                onClick={() => { setNewInvite(null); setInviteError(''); setInviteOpen(true); }}
                style={{ padding: '10px 16px', opacity: parentAccessLocked ? 0.55 : 1, cursor: parentAccessLocked ? 'not-allowed' : 'pointer' }}
              >
                🔑 {t('pcOption1Action')}
              </button>
              {parentAccessLocked && (
                <p className="mu" style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>
                  {activeParentConn
                    ? 'A parent is already connected. Revoke access below before adding another.'
                    : 'A parent request is already waiting for your approval.'}
                </p>
              )}
            </div>

            <div className="pc-option-card">
              <span className="tag good">OPTION 2</span>
              <h4>{t('pcOption2Title')}</h4>
              <p className="mu">{t('pcOption2Body')}</p>
              <button
                className="pri"
                onClick={() => setParentConnectOpen(true)}
                style={{ padding: '10px 16px' }}
              >
                📊 {t('pcOption2Action')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Phase 5 & Part 2/3: Student Parent Connection Requests & OTP Revocation */}
      {isStudent && (
        <section className="card" style={{ marginTop: '20px', border: '1px solid rgba(139,92,246,0.35)', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,27,75,0.75))', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span className="tag purple" style={{ letterSpacing: '0.08em' }}>PARENT–STUDENT CONNECTIONS</span>
                <h3 style={{ margin: '8px 0 4px', fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
                  🔗 Manage Parent Access
                </h3>
                <p className="mu" style={{ margin: 0, fontSize: '0.86rem', color: '#94a3b8' }}>
                  Review incoming parent connection requests, manage access approvals, or request secure OTP-verified access removal.
                </p>
              </div>
              {/* Parent search bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="text"
                  value={parentSearchQ}
                  onChange={(e) => setParentSearchQ(e.target.value)}
                  placeholder="Filter requests..."
                  style={{
                    padding: '6px 12px', fontSize: '0.82rem', background: 'rgba(15,23,42,0.8)',
                    border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', color: '#e2e8f0', width: '160px'
                  }}
                />
                {parentSearchQ && (
                  <button
                    onClick={() => setParentSearchQ('')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
                  >✕</button>
                )}
              </div>
            </div>
          </div>

          {parentConnMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#6ee7b7', fontSize: '0.86rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✓</span> <span>{parentConnMsg}</span>
            </div>
          )}
          {parentConnErr && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.86rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> <span>{parentConnErr}</span>
            </div>
          )}

          {/* Connected relationship card */}
          {activeParentConn && (
            <div style={{
              padding: '16px 18px', borderRadius: '12px', marginBottom: '16px',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(15,23,42,0.85))',
              border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 4px 16px rgba(16,185,129,0.1)'
            }}>
              <div className="row spaced" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>👨‍👩‍👧</span>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f8fafc' }}>
                      ✓ Connected: {activeParentConn.parent_name || 'Parent'}
                    </span>
                    <span className="tag good" style={{ fontSize: '0.7rem' }}>CONNECTED · PARENT VERIFIED</span>
                    <span style={{ fontSize: '0.78rem', color: '#a78bfa' }}>({activeParentConn.relationship_type})</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '4px' }}>
                    ✉️ {activeParentConn.parent_email || 'Verified parent email'}
                    {activeParentConn.school_name && (
                      <span style={{ marginLeft: '10px', color: '#94a3b8' }}>🏫 {activeParentConn.school_name}</span>
                    )}
                    {activeParentConn.teacher_name && (
                      <span style={{ marginLeft: '10px', color: '#94a3b8' }}>👨‍🏫 Teacher: {activeParentConn.teacher_name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '4px' }}>
                    Access approved on {activeParentConn.verified_at ? new Date(activeParentConn.verified_at).toLocaleDateString() : new Date(activeParentConn.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Secure OTP-based removal trigger */}
                <button
                  type="button"
                  disabled={parentConnBusy || revocationBusy}
                  onClick={() => setShowRevocationModal(true)}
                  style={{
                    padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600,
                    border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px',
                    color: '#f87171', background: 'rgba(239,68,68,0.08)', cursor: 'pointer',
                    transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                >
                  🔒 Request to Remove Parent Access
                </button>
              </div>

              {revocationInfo && (
                <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fde047', fontSize: '0.78rem' }}>
                  ⏳ Revocation OTP dispatched to <strong>{revocationInfo.parent_email_masked}</strong>. Connection remains active until parent confirms.
                </div>
              )}
            </div>
          )}

          {/* Pending Connection Requests List */}
          {(() => {
            const pendingList = parentConnections
              .filter(c => c.status === 'pending')
              .filter(c => !parentSearchQ || (c.parent_name || '').toLowerCase().includes(parentSearchQ.toLowerCase()) || (c.parent_email || '').toLowerCase().includes(parentSearchQ.toLowerCase()));

            return (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⏳</span> <span>Pending Requests ({pendingList.length})</span>
                  </h4>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Waiting for your approval</span>
                </div>

                {pendingList.length === 0 ? (
                  <p style={{ margin: '8px 0', fontSize: '0.84rem', color: '#64748b', fontStyle: 'italic' }}>
                    {parentSearchQ ? 'No requests match your filter.' : 'No pending connection requests.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pendingList.map(conn => (
                      <div key={conn.id} style={{
                        padding: '14px 16px', borderRadius: '10px',
                        background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(251,191,36,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: '12px'
                      }}>
                        <div style={{ flex: '1 1 300px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>
                              {conn.parent_name || 'Parent'}
                            </span>
                            <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>({conn.relationship_type || 'parent'})</span>
                            {/* Email verification status badge */}
                            <span style={{
                              fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                              background: conn.email_verified ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                              color: conn.email_verified ? '#6ee7b7' : '#fca5a5',
                              border: conn.email_verified ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)'
                            }}>
                              {conn.email_verified ? '✓ Email Verified' : '⚠️ Email Not Verified'}
                            </span>
                            <span className="tag warn" style={{ fontSize: '0.7rem' }}>
                              {conn.display_status || 'Pending Student Approval'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '4px' }}>
                            ✉️ {conn.parent_email || 'No email specified'}
                          </div>

                          <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.76rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                            {conn.school_name && <span>🏫 School: <strong>{conn.school_name}</strong></span>}
                            {conn.teacher_name && <span>👨‍🏫 Teacher: <strong>{conn.teacher_name}</strong></span>}
                            <span>📅 Requested: {new Date(conn.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Accept / Reject actions */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            className="pri"
                            disabled={parentConnBusy}
                            onClick={() => handleApproveParentConn(conn.id)}
                            style={{
                              padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700,
                              background: '#10b981', border: 'none', borderRadius: '8px',
                              color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                          >
                            ✓ Accept Request
                          </button>
                          <button
                            className="sec"
                            disabled={parentConnBusy}
                            onClick={() => handleRejectParentConn(conn.id)}
                            style={{
                              padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600,
                              border: '1px solid #ef4444', borderRadius: '8px',
                              color: '#f87171', background: 'rgba(239,68,68,0.08)', cursor: 'pointer'
                            }}
                          >
                            ✕ Reject Request
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Connection history */}
          {parentAccessHistory.length > 0 && (
            <details style={{ marginTop: '14px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
                📜 Previous Connection History ({parentAccessHistory.length})
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                {parentAccessHistory.map(conn => (
                  <div key={conn.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: '10px',
                    padding: '8px 14px', borderRadius: '8px',
                    background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)',
                    fontSize: '0.78rem', color: '#94a3b8', flexWrap: 'wrap'
                  }}>
                    <span>
                      <strong>{conn.parent_name || 'Parent'}</strong> ({conn.relationship_type}) · {conn.parent_email}
                      {conn.school_name ? ` · ${conn.school_name}` : ''}
                    </span>
                    <span style={{
                      fontWeight: 700,
                      color: conn.status === 'revoked' ? '#f87171' : conn.status === 'rejected' ? '#fbbf24' : '#94a3b8'
                    }}>
                      {conn.display_status || conn.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* AI Course & Engagement Orchestrator: published lessons + assistant */}
      {isStudent && <MyLearningPlan lang={lang} t={t} />}

      {/* Part 6: Student Dashboard Teacher Search */}
      {isStudent && (
        <section className="card" style={{ marginTop: '20px', border: '1px solid rgba(6,182,212,0.3)', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(8,47,73,0.7))', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div style={{ marginBottom: '16px' }}>
            <span className="tag cyan" style={{ letterSpacing: '0.08em' }}>ASSIGNED EDUCATORS</span>
            <h3 style={{ margin: '8px 0 4px', fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
              👨‍🏫 Search & Connect With Your Teachers
            </h3>
            <p className="mu" style={{ margin: 0, fontSize: '0.86rem', color: '#94a3b8' }}>
              Find certified teachers assigned to your class and section ({currentUser?.class_name || 'Class 8'}).
            </p>
          </div>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px' }}>
              <input
                type="text"
                value={teacherSearchQ}
                onChange={(e) => handleTeacherSearch(e.target.value)}
                placeholder="Search teachers by name, teacher ID, subject, or section..."
                style={{
                  width: '100%', padding: '10px 14px 10px 36px', fontSize: '0.9rem',
                  background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(6,182,212,0.4)',
                  borderRadius: '10px', color: '#f1f5f9', outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#06b6d4' }}>🔍</span>
              {teacherSearchQ && (
                <button
                  type="button"
                  onClick={() => handleTeacherSearch('')}
                  style={{ position: 'absolute', right: '12px', top: '9px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.95rem' }}
                >✕</button>
              )}
            </div>
            {teacherLoading && (
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: '#06b6d4' }}>
                Searching…
              </span>
            )}
          </div>

          {/* Teacher cards */}
          {teacherResults.length === 0 ? (
            <p style={{ margin: '12px 0', fontSize: '0.86rem', color: '#64748b', fontStyle: 'italic' }}>
              {teacherSearchQ ? 'No teachers found for that query in your class.' : 'No teachers currently listed for your class.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {teacherResults.map((t) => (
                <div key={t.id} style={{
                  padding: '14px 16px', borderRadius: '12px',
                  background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(6,182,212,0.25)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.96rem', color: '#f8fafc' }}>
                        {t.full_name}
                      </span>
                      <span className="tag cyan" style={{ fontSize: '0.68rem' }}>TEACHER</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#06b6d4', marginTop: '4px' }}>
                      📐 Subject: Mathematics · {t.class_name || 'Class 8'}
                    </div>
                    {t.email && (
                      <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '2px' }}>
                        ✉️ {t.email}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTeacherModal(t)}
                    style={{
                      padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                      background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)',
                      borderRadius: '8px', color: '#67e8f9', cursor: 'pointer', textAlign: 'center'
                    }}
                  >
                    View Teacher Details →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Teacher Detail Modal (Part 6) */}
      {selectedTeacherModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(10px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }} role="dialog" aria-modal="true">
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #164e63)', border: '1px solid #06b6d4',
            borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: 800 }}>
                👨‍🏫 Teacher Profile
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTeacherModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >✕</button>
            </div>
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>{selectedTeacherModal.full_name}</div>
              <div style={{ fontSize: '0.84rem', color: '#06b6d4', marginTop: '4px' }}>Teacher ID: #{selectedTeacherModal.id}</div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '6px' }}>
                <strong>Class Assigned:</strong> {selectedTeacherModal.class_name || 'Class 8'}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '4px' }}>
                <strong>Curriculum Subject:</strong> Class 8 Mathematics (Rational Numbers)
              </div>
              {selectedTeacherModal.email && (
                <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '4px' }}>
                  <strong>Official School Email:</strong> {selectedTeacherModal.email}
                </div>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 16px' }}>
              🔒 Official verified educator account. Connected parents can send direct messages to this teacher from the Parent dashboard.
            </p>
            <button
              type="button"
              onClick={() => setSelectedTeacherModal(null)}
              style={{
                width: '100%', padding: '10px', background: '#06b6d4', color: '#0f172a',
                border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: OTP-Based Parent Access Revocation (Part 3) */}
      {showRevocationModal && activeParentConn && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.88)',
          backdropFilter: 'blur(10px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }} role="dialog" aria-modal="true">
          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b, #0f172a)', border: '1px solid #8b5cf6',
            borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '26px', boxShadow: '0 24px 60px rgba(0,0,0,0.7)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
                🔐 Request Parent Access Removal
              </h3>
              <button
                type="button"
                onClick={() => setShowRevocationModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '16px' }}>
              ⚠️ Are you sure you want to remove access for <strong>{activeParentConn.parent_name}</strong>?
            </div>

            <p style={{ fontSize: '0.86rem', color: '#cbd5e1', lineHeight: '1.6', margin: '0 0 14px' }}>
              To ensure safety and prevent accidental disconnection, access is <strong>NOT</strong> revoked immediately:
            </p>

            <ol style={{ fontSize: '0.82rem', color: '#94a3b8', paddingLeft: '20px', lineHeight: '1.7', margin: '0 0 18px' }}>
              <li>A secure 6-digit confirmation code (OTP) will be dispatched to your parent's registered email ({activeParentConn.parent_email || 'verified email'}).</li>
              <li>Your parent must verify the OTP in UDAAN to confirm access removal.</li>
              <li>Only after successful OTP verification will parent access be revoked.</li>
              <li>If the parent does not confirm within 5 minutes, access remains active.</li>
            </ol>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowRevocationModal(false)}
                style={{
                  padding: '9px 18px', fontSize: '0.85rem', fontWeight: 600,
                  border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px',
                  color: '#94a3b8', background: 'none', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revocationBusy}
                onClick={() => handleRequestRevocation(activeParentConn.id)}
                style={{
                  padding: '9px 20px', fontSize: '0.85rem', fontWeight: 700,
                  border: 'none', borderRadius: '8px',
                  color: '#ffffff', background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  cursor: revocationBusy ? 'wait' : 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.35)'
                }}
              >
                {revocationBusy ? 'Sending OTP…' : 'Send Removal Request OTP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && isStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.88)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setInviteOpen(false); }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-parent-title"
            style={{ maxWidth: '620px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#0d1117', border: '1.5px solid #10b981' }}
          >
            <div className="row spaced" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div>
                <span className="tag good">INVITE PARENT</span>
                <h2 id="invite-parent-title" style={{ margin: '4px 0', fontSize: '1.35rem' }}>
                  🔑 Parent invitation code
                </h2>
                <p className="mu" style={{ margin: 0, fontSize: '0.82rem' }}>
                  Share this code privately. It works only once and expires automatically. A code alone does not
                  prove guardianship — a teacher verifies it.
                </p>
              </div>
              <button className="sec" onClick={() => setInviteOpen(false)} aria-label="Close invite parent dialog" style={{ padding: '4px 10px' }}>
                ✕
              </button>
            </div>

            {inviteError && (
              <div role="alert" style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid #f43f5e', color: '#fecdd3', fontSize: '0.85rem' }}>
                ⚠️ {inviteError}
              </div>
            )}

            {newInvite?.invitation_code ? (
              <div style={{ marginTop: '16px', padding: '18px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1.5px solid #10b981', textAlign: 'center' }}>
                <div className="mu" style={{ fontSize: '0.8rem' }}>Give this code to your parent or guardian</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '0.14em', margin: '8px 0', color: '#6ee7b7', wordBreak: 'break-all' }}>
                  {newInvite.invitation_code}
                </div>
                <div className="mu" style={{ fontSize: '0.78rem' }}>
                  Expires {new Date(newInvite.expires_at).toLocaleDateString()}
                </div>
                <button type="button" className="pri" onClick={() => handleCopyInvite(newInvite.invitation_code)} style={{ marginTop: '10px' }}>
                  {inviteCopied ? '✓ Copied' : '📋 Copy code'}
                </button>
              </div>
            ) : (
              <button type="button" className="pri" onClick={handleCreateInvite} disabled={inviteLoading} style={{ marginTop: '16px', width: '100%', padding: '12px' }}>
                {inviteLoading ? 'Creating…' : '➕ Create a new invitation code'}
              </button>
            )}

            <h4 style={{ margin: '20px 0 8px', fontSize: '1rem' }}>Your invitation codes</h4>
            {inviteLoading && invitations.length === 0 ? (
              <p className="mu">Loading…</p>
            ) : invitations.length === 0 ? (
              <p className="mu" style={{ fontSize: '0.86rem' }}>No invitation codes yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {invitations.map((inv) => {
                  const status = inviteStatus(inv);
                  const active = status === 'Active';
                  return (
                    <div key={inv.id} className="row spaced" style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <b style={{ fontSize: '0.86rem' }}>{inv.id === newInvite?.id ? inv.invitation_code : `Code #${inv.id}`}</b>
                        <div className="mu" style={{ fontSize: '0.75rem' }}>
                          Created {new Date(inv.created_at).toLocaleDateString()} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                        <span className={`tag ${status === 'Active' ? 'good' : status === 'Used ✓' ? 'purple' : 'warn'}`}>{status}</span>
                        {inv.id === newInvite?.id && inv.invitation_code && (
                          <button className="sec" onClick={() => handleCopyInvite(inv.invitation_code)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                            📋 Copy
                          </button>
                        )}
                        {active && (
                          <button className="sec" onClick={() => handleRevokeInvite(inv.id)} style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#fca5a5', borderColor: '#ef4444' }}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {parentConnectOpen && isStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.88)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setParentConnectOpen(false); }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-connect-title"
            style={{ maxWidth: '960px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#0d1117', border: '1.5px solid #10b981' }}
          >
            <div className="row spaced" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div>
                <span className="tag good">OPTION 2</span>
                <h2 id="parent-connect-title" style={{ margin: '4px 0', fontSize: '1.35rem' }}>
                  📊 {t('pcOption2Title')}
                </h2>
                <p className="mu" style={{ margin: 0, fontSize: '0.82rem' }}>
                  {t('pcStudentParentLoginNote')}
                </p>
              </div>
              <button
                className="sec"
                onClick={() => setParentConnectOpen(false)}
                aria-label="Close ParentConnect dialog"
                style={{ padding: '4px 10px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: '12px' }}>
              <ParentConnect lang={lang} t={t} mode="student" />
            </div>
          </div>
        </div>
      )}

      {/* 2. PERSONALIZED LEARNING ROADMAP ("YOUR LEARNING JOURNEY") */}
      <section className="card" style={{ marginTop: '20px' }}>
        <div className="row spaced" style={{ marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{t('roadmapTitle')}</h3>
            <span className="mu" style={{ fontSize: '0.85rem' }}>
              NCERT Class 8 Rational Numbers: Prerequisite dependency chain dynamically updated based on mastery.
            </span>
          </div>
          <span className="tag purple">Adaptive Sequence</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            position: 'relative'
          }}
        >
          {roadmapItems.map((item, idx) => {
            const isCompleted = item.status === 'completed';
            const isInProgress = item.status === 'in_progress';
            const isNeedsPractice = item.status === 'needs_practice';

            let borderColor = 'rgba(255, 255, 255, 0.1)';
            let bgColor = 'rgba(255, 255, 255, 0.02)';
            let badgeClass = 'mu';

            if (isCompleted) {
              borderColor = '#10b981';
              bgColor = 'rgba(16, 185, 129, 0.08)';
              badgeClass = 'tag good';
            } else if (isInProgress) {
              borderColor = '#00f2fe';
              bgColor = 'rgba(0, 242, 254, 0.08)';
              badgeClass = 'tag';
            } else if (isNeedsPractice) {
              borderColor = '#fb923c';
              bgColor = 'rgba(251, 146, 60, 0.08)';
              badgeClass = 'tag warn';
            }

            return (
              <div
                key={item.concept_id}
                style={{
                  padding: '14px 12px',
                  borderRadius: '12px',
                  border: `1.5px solid ${borderColor}`,
                  background: bgColor,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'transform 0.2s ease'
                }}
              >
                <div className="row spaced" style={{ fontSize: '0.74rem' }}>
                  <span className="mu">Step {idx + 1}</span>
                  <span className={badgeClass}>{item.status_label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', minHeight: '38px', lineHeight: '1.3' }}>
                  {lang === 'te' ? item.title_te : item.title_en}
                </div>
                <div className="row spaced" style={{ fontSize: '0.78rem', marginTop: 'auto' }}>
                  <span className="mu">Mastery:</span>
                  <b>{item.mastery_pct}%</b>
                </div>
                <div className="bar" style={{ height: '4px' }}>
                  <i style={{ width: `${item.mastery_pct}%`, background: borderColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. RECOMMENDED LEARNING CARD ("WHAT TO LEARN NEXT") */}
      <section
        className="card"
        style={{
          marginTop: '20px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(138, 75, 255, 0.08) 100%)',
          border: '1.5px solid rgba(0, 242, 254, 0.35)',
          padding: '22px 26px'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'center' }}>
          <div>
            <div className="row" style={{ gap: '8px', marginBottom: '6px' }}>
              <span className="tag good">🎯 {t('recommendedNext')}</span>
              <span className="tag purple">{recommended.recommended_difficulty}</span>
              <span className="tag mu">⏱️ {recommended.estimated_time_mins} mins</span>
            </div>
            <h3 style={{ fontSize: '1.4rem', margin: '4px 0 8px' }}>
              {lang === 'te' ? recommended.title_te : recommended.title_en}
            </h3>
            <p className="mu" style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.4' }}>
              <b>{t('whyActivity')}</b> {recommended.why_recommended}
            </p>
          </div>
          <button
            className="pri"
            onClick={onLaunchDetective}
            style={{ padding: '12px 20px', fontSize: '0.95rem', whiteSpace: 'nowrap' }}
          >
            🚀 Start Targeted Practice
          </button>
        </div>
      </section>

      {/* 4. ACTIVE ADAPTIVE PATH SHOWCASE */}
      <div
        className="card"
        style={{
          marginTop: '20px',
          border: `1.5px solid ${currentPath.color}60`,
          background: 'linear-gradient(135deg, rgba(16, 17, 22, 0.9) 0%, rgba(10, 12, 18, 0.95) 100%)',
          boxShadow: `0 12px 32px -8px ${currentPath.color}25`
        }}
      >
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div className="row" style={{ gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>{currentPath.icon}</span>
            <div>
              <span className={`tag ${currentPath.badgeClass}`}>ACTIVE DIVERGENT LEARNING PATH</span>
              <h2 style={{ margin: '4px 0 2px', fontSize: '1.35rem', color: currentPath.color }}>
                {currentPath.title}
              </h2>
            </div>
          </div>
          <div className="row" style={{ gap: '8px' }}>
            <button
              className={activePathId === 'struggling' ? 'warn' : 'sec'}
              onClick={() => setSimulatedPathOverride('struggling')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Remedial
            </button>
            <button
              className={activePathId === 'normal' ? 'pri' : 'sec'}
              onClick={() => setSimulatedPathOverride('normal')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Guided
            </button>
            <button
              className={activePathId === 'advanced' ? 'good' : 'sec'}
              onClick={() => setSimulatedPathOverride('advanced')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Advanced
            </button>
          </div>
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.4' }}>
          <b>{t('whyActivity')}</b> {currentPath.why}
        </div>
      </div>

      {/* 5. INTERACTIVE PRACTICE & MASTER MATRIX TWO-COLUMN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(300px, 1fr)', gap: '20px', marginTop: '20px' }}>
        {/* Left Column: Interactive Practice with Audio & Speech */}
        <div>
          <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.3)' }}>
            <div style={{ marginBottom: 10 }}>
              <span className="tag purple" title="Question tier selected from your live BKT/rule-engine level">
                Adaptive difficulty: {adaptiveTier.toUpperCase()} (level {conceptRuleLevel})
                {tierAdjusted ? ` · nearest bank: ${effectiveTier.toUpperCase()}` : ''}
              </span>
            </div>
            {/* Topic Filter Pill Buttons */}
            <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="row spaced" style={{ marginBottom: 6, flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#00f2fe' }}>
                  {lang === 'te' ? 'అధ్యాయం / టాపిక్‌ను ఎంచుకోండి:' : 'CHOOSE PRACTICE TOPIC:'}
                </span>
                <span className="mu" style={{ fontSize: '0.75rem' }}>
                  {filteredPracticeQuestions.length} {lang === 'te' ? 'ప్రశ్నలు అందుబాటులో ఉన్నాయి' : 'Questions Available'}
                </span>
              </div>
              <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label_en: 'All Topics', label_te: 'అన్ని టాపిక్‌లు' },
                  { id: 'c5', label_en: 'Adding Rationals (c5)', label_te: 'సంకలనం (c5)' },
                  { id: 'c2', label_en: 'Equivalent Fractions (c2)', label_te: 'సమాన భిన్నాలు (c2)' },
                  { id: 'c4', label_en: 'Number Line & Signs (c4)', label_te: 'సంఖ్యా రేఖ & గుర్తులు (c4)' },
                  { id: 'c6', label_en: 'Multiply & Divide (c6)', label_te: 'గుణకారం & భాగహారం (c6)' }
                ].map((top) => (
                  <button
                    key={top.id}
                    className={selectedTopic === top.id ? 'pri' : 'sec'}
                    onClick={() => {
                      setSelectedTopic(top.id);
                      setPracticeIdx(0);
                      setSelectedOption(null);
                      setFeedback(null);
                      setShowHint(false);
                    }}
                    style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '8px' }}
                  >
                    {lang === 'te' ? top.label_te : top.label_en}
                  </button>
                ))}
              </div>
            </div>

            <div className="row spaced" style={{ marginBottom: 12 }}>
              <div>
                <span className="tag">{currentQ.topic ? `NCERT ${currentQ.topic.toUpperCase()}` : 'NCERT'} · Practice #{practiceIdx + 1}</span>
                <h3 style={{ fontSize: '1.25rem', margin: '6px 0 2px' }}>
                  {lang === 'te' ? (currentQ.topic_name_te || currentQ.stem_te) : (currentQ.topic_name_en || currentQ.stem_en)}
                </h3>
              </div>
              <div className="row" style={{ gap: '6px' }}>
                {/* Read Aloud Button */}
                <button
                  className={isSpeaking ? 'warn' : 'sec'}
                  onClick={() => handleReadAloud(`${lang === 'te' ? currentQ.stem_te : currentQ.stem_en}${showHint ? (lang === 'te' ? `. సూచన: ${currentQ.hint_te}` : `. Hint: ${currentQ.hint_en}`) : ''}`)}
                  style={{ padding: '5px 9px', fontSize: '0.8rem' }}
                  title="Read question aloud in selected language"
                >
                  {isSpeaking ? `⏹️ ${t('stopAudio')}` : `🔊 ${t('readAloud')}`}
                </button>
                {/* Voice Input Mic Button */}
                <button
                  className={isListening ? 'warn' : 'sec'}
                  onClick={handleVoiceInput}
                  style={{ padding: '5px 9px', fontSize: '0.8rem' }}
                  title="Answer using microphone speech recognition"
                >
                  🎙️ {isListening ? 'Listening...' : t('voiceMic')}
                </button>
              </div>
            </div>

            {voiceNotice && (
              <div style={{ fontSize: '0.82rem', color: '#00f2fe', marginBottom: 8, fontStyle: 'italic' }}>
                {voiceNotice}
              </div>
            )}

            <div
              style={{
                background: 'rgba(0, 242, 254, 0.05)',
                border: '1px solid rgba(0, 242, 254, 0.2)',
                borderRadius: '14px',
                padding: '16px 20px',
                fontSize: '1.35rem',
                fontWeight: 900,
                color: '#ffffff',
                textAlign: 'center',
                margin: '12px 0'
              }}
            >
              {lang === 'te' ? currentQ.stem_te : currentQ.stem_en}
            </div>

            {/* Progressive Hint (Hidden by default to prevent answer revealing) */}
            <div style={{ margin: '10px 0' }}>
              <button
                type="button"
                className="sec"
                onClick={() => setShowHint(!showHint)}
                style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '6px' }}
              >
                {showHint ? '🙈 ' + (lang === 'te' ? 'సూచన దాచు' : 'Hide Hint') : '💡 ' + (lang === 'te' ? 'సూచన చూడండి (ఐచ్ఛికం)' : 'Need a Hint? (Optional)')}
              </button>
              {showHint && (
                <div style={{ fontSize: '0.86rem', color: '#fb923c', marginTop: 8, padding: '8px 12px', background: 'rgba(251, 146, 60, 0.08)', borderRadius: '8px', border: '1px solid rgba(251, 146, 60, 0.25)', animation: 'fadeIn 0.2s ease' }}>
                  💡 <b>Hint:</b> {lang === 'te' ? currentQ.hint_te : currentQ.hint_en}
                </div>
              )}
            </div>

            {/* Answer Options */}
            <div style={{ margin: '14px 0' }}>
              {currentQ.options.map((opt, i) => {
                let optClass = 'opt';
                if (selectedOption === opt.text) {
                  optClass += opt.correct ? ' right' : ' wrong';
                }

                return (
                  <button
                    key={i}
                    className={optClass}
                    onClick={() => !feedback && handlePick(opt)}
                    disabled={!!feedback}
                  >
                    <span style={{ fontWeight: 700 }}>{opt.text}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>Option {String.fromCharCode(65 + i)}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: feedback.isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  border: `1px solid ${feedback.isCorrect ? '#10b981' : '#f43f5e'}`,
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  animation: 'fadeIn 0.3s ease',
                  marginTop: '12px'
                }}
              >
                <div className="row spaced" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <b>{feedback.isCorrect ? '✓ Correct!' : '✗ Misconception Detected:'}</b> {feedback.exp}
                  </div>
                  <button
                    className="pri"
                    onClick={() => {
                      setPracticeIdx(prev => prev + 1);
                      setSelectedOption(null);
                      setFeedback(null);
                      setShowHint(false);
                    }}
                    style={{ fontSize: '0.78rem', padding: '6px 12px', whiteSpace: 'nowrap', marginLeft: 12 }}
                  >
                    {t('next')} ➔
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 6. LEARNING HISTORY & DIAGNOSTIC AUDIT LOG */}
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: 12 }}>{t('learningHistory')}</h3>
            {profile?.diagnostic_history && profile.diagnostic_history.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Your Answer</th>
                      <th>Diagnosed Misconception</th>
                      <th>Status</th>
                      <th>Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.diagnostic_history.map((dh) => (
                      <tr key={dh.id}>
                        <td><code>{dh.original_question}</code></td>
                        <td><b>{dh.student_response}</b></td>
                        <td><span className="tag warn">{dh.suspected_misconception}</span></td>
                        <td>{dh.confirmation_status === 'confirmed' ? 'Verified Gap' : (dh.confirmation_status === 'refuted_slip' ? 'Careless Slip' : 'Mastered')}</td>
                        <td>
                          {dh.reassessment_result === 'recovered' ? (
                            <span className="tag good">Recovered ✓</span>
                          ) : (
                            <span className="tag danger">Needs Support ⚠️</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mu" style={{ fontStyle: 'italic', fontSize: '0.88rem' }}>
                Complete diagnostic cases in the Learning Detective to view your verified misconception history.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Mastery Crystals, 3D Visualizer & Badges */}
        <div>
          {/* Topic-Wise Mastery Matrix */}
          <div className="card" style={{ border: '1px solid rgba(138, 75, 255, 0.25)' }}>
            <div className="row spaced" style={{ marginBottom: 10 }}>
              <h3>{t('mastery')}</h3>
              <span className="tag purple">{concepts.length} Concepts</span>
            </div>
            <p className="mu" style={{ fontSize: '0.84rem', margin: '0 0 12px' }}>
              Estimates updated via Corbett & Anderson (1994) BKT formulation:
            </p>

            {concepts.map((c) => {
              const score = mastery[c.id];
              const source = c.id === 'c5' ? 'bkt' : 'baseline';
              return (
                <MasteryCrystal
                  key={c.id}
                  conceptId={c.id}
                  title={lang === 'te' ? c.te : c.en}
                  score={score}
                  source={source}
                  ruleState={c.id === 'c5' ? ruleState.c5 : null}
                  lang={lang}
                />
              );
            })}
          </div>

          {/* Achievement Badges Suite */}
          <div className="card" style={{ marginTop: '20px' }}>
            <div className="row spaced" style={{ marginBottom: 10 }}>
              <h3>{t('badgesTitle')}</h3>
              <span className="tag good">{badges.filter(b => b.earned).length} Earned</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              {badges.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: b.earned ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px dashed rgba(255, 255, 255, 0.1)',
                    background: b.earned ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.01)',
                    textAlign: 'center',
                    opacity: b.earned ? 1 : 0.5
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{b.earned ? '🏆' : '🔒'}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    {lang === 'te' ? (b.name_te || b.name_en) : b.name_en}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mu)', marginTop: '2px' }}>
                    {b.desc_en}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3D Rational Math Cube Box */}
          <div className="card" style={{ textAlign: 'center', marginTop: '20px' }}>
            <span className="tag">NCERT 3D VISUALIZER</span>
            {!lowBandwidth ? (
              <Cube3D />
            ) : (
              <div style={{ padding: '24px 0', fontSize: '2rem' }}>🧊 ½ ↔ -¾</div>
            )}
            <div style={{ fontSize: '0.82rem', color: 'var(--mu)', marginTop: 6 }}>
              Spatial manipulation of signed rational parts and equivalent fractions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
