# UDAAN — Scientific Evaluation Methodology & BKT Comparison Protocol

## 1. Context & Scientific Transparency
Adaptive learning platforms frequently claim "AI optimization" or "Bayesian superiority" without presenting empirical evidence or acknowledging mathematical boundary limitations.
In UDAAN, we adopt an honest, rigorous posture:
- **Baseline Priors:** Initial BKT parameters ($P(L_0)=0.30$, $P(T)=0.15$, $P(S)=0.10$, $P(G)=0.25$) are baseline values from cognitive tutoring literature (Corbett & Anderson, 1994). They are **unvalidated literature defaults** and are clearly labelled as such in the interface.
- **Synthetic Benchmarks:** The 8 comparison cases in the Model Comparison view are synthetic test sequences designed for algorithmic verification, **not empirical pilot results**.
- **Equivalence Notice:** A more complex model is not intrinsically better merely because it utilizes Bayesian formulation. Simple rule heuristics often provide equal or superior explainability for frontline classroom teachers.

---

## 2. Mathematical Formulation: Bayesian Knowledge Tracing
BKT models student knowledge state as a two-state Hidden Markov Model (HMM):
- $P(L_t)$: Probability the student has mastered the specific concept at time $t$.
- $P(T)$: Probability that learning occurs between opportunities.
- $P(S)$: Slip probability (student knows the concept but makes an error).
- $P(G)$: Guess probability (student does not know the concept but guesses correctly).

### Update Equations:
Upon observing student answer $X_t \in \{1 \text{ (correct)}, 0 \text{ (incorrect)}\}$:
$$\text{Posterior } P(L_t | X_t=1) = \frac{P(L_{t-1}) \cdot (1 - P(S))}{P(L_{t-1}) \cdot (1 - P(S)) + (1 - P(L_{t-1})) \cdot P(G)}$$
$$\text{Posterior } P(L_t | X_t=0) = \frac{P(L_{t-1}) \cdot P(S)}{P(L_{t-1}) \cdot P(S) + (1 - P(L_{t-1})) \cdot (1 - P(G))}$$

Accounting for the learning transition:
$$P(L_{t+1}) = P(L_t | X_t) + (1 - P(L_t | X_t)) \cdot P(T)$$

### Numerical Stability & Boundary Guards:
To prevent numerical breakdown, division-by-zero, and probability degeneracies:
1. $P(L)$ is clamped to $[0.001, 0.999]$.
2. Denominators are bounded by $\epsilon = 1 \times 10^{-9}$.
3. Parameters are verified to satisfy:
   $$0 < P(L_0) < 1, \quad 0 < P(T) < 1, \quad 0 \le P(S) < 0.5, \quad 0 \le P(G) < 0.5, \quad P(S) + P(G) < 1.0$$

---

## 3. Recommended Pilot Protocol for Empirical Validation
To transition from synthetic verification to validated scientific claims, the following study protocol must be executed:

### Phase 1: Ground-Truth Error Coding (Weeks 1–2)
- Collect 1,000 unassisted student diagnostic problem submissions across 4 schools.
- Independent double-blind coding by two experienced NCERT mathematics teachers tagging student errors into misconception categories (`num_den_separate`, `ignored_negative`, `sign_slip`, or `careless_slip`).
- Calculate Inter-Rater Reliability (Cohen's $\kappa \ge 0.80$).

### Phase 2: Controlled Field Trial (Weeks 3–6)
- Multi-arm randomized cluster trial across 8 sections of Class 8:
  - **Group A (Control):** Standard practice with binary right/wrong feedback.
  - **Group B (Heuristic Rules):** UDAAN rule-based adaptation with prerequisite drops and teacher cards.
  - **Group C (Probabilistic BKT):** UDAAN BKT-driven adaptation.
- Pre-test and post-test measurement using standardized NCERT assessments with delayed retention checks at 2 weeks.

### Phase 3: Model Fit & Predictive Accuracy Evaluation
- Compute Root Mean Square Error (RMSE) and Area Under the ROC Curve (AUC) on predicting student performance on the next attempt ($X_{t+1}$).
- Disagreements between Rule and BKT predictions must be analyzed qualitatively with participating teachers.
