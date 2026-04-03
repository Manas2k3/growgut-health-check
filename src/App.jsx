import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseConfig";
import giBudLogo from "../image.png";

const TOTAL_STEPS = 4;
const COLLECTION_NAME = "growgut-health-check";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mosaif.gibud";
const GEMINI_API_KEY = typeof __GEMINI_API_KEY__ === "string" ? __GEMINI_API_KEY__ : "";

const surveyQuestions = [
  {
    id: "bloatingAfterMeals",
    title: "Do you feel bloated after meals?",
    helper: "1 = Rarely, 5 = Almost always",
    minLabel: "Rarely",
    maxLabel: "Almost always",
    invert: true,
  },
  {
    id: "energyLevels",
    title: "How would you rate your daily energy levels?",
    helper: "1 = Very low, 5 = Excellent",
    minLabel: "Very low",
    maxLabel: "Excellent",
    invert: false,
  },
  {
    id: "bowelRegularity",
    title: "How regular is your digestion through the week?",
    helper: "1 = Not regular, 5 = Very regular",
    minLabel: "Irregular",
    maxLabel: "Very regular",
    invert: false,
  },
  {
    id: "stomachDiscomfort",
    title: "How often do you feel stomach discomfort?",
    helper: "1 = Never, 5 = Frequently",
    minLabel: "Never",
    maxLabel: "Frequently",
    invert: true,
  },
  {
    id: "stressImpact",
    title: "Does stress seem to affect your digestion?",
    helper: "1 = Not really, 5 = Very strongly",
    minLabel: "Not really",
    maxLabel: "Very strongly",
    invert: true,
  },
  {
    id: "mealComfort",
    title: "How comfortable do you feel after most meals?",
    helper: "1 = Uncomfortable, 5 = Great",
    minLabel: "Uncomfortable",
    maxLabel: "Great",
    invert: false,
  },
];

const scoreLabels = [
  {
    min: 85,
    title: "Excellent momentum",
    description: "Your current habits suggest a strong gut foundation. Keep building on it.",
  },
  {
    min: 70,
    title: "Promising baseline",
    description: "There are a few areas to optimize, and your personalized app insights can help.",
  },
  {
    min: 50,
    title: "Needs attention",
    description: "Your answers suggest a few digestive stress signals worth understanding more deeply.",
  },
  {
    min: 0,
    title: "Time to rebalance",
    description: "Your gut may be asking for more support. The app can help uncover patterns early.",
  },
];

const initialFormData = {
  name: "",
  age: "",
  phoneNumber: "",
  bloatingAfterMeals: 0,
  energyLevels: 0,
  bowelRegularity: 0,
  stomachDiscomfort: 0,
  stressImpact: 0,
  mealComfort: 0,
};

const fallbackInsights = {
  headline: "Your gut patterns show a few signals worth exploring",
  summary:
    "Your answers suggest there may be everyday habits or triggers affecting digestion, comfort, and energy. A deeper check inside the app can help connect the dots.",
  focusAreas: ["Meal response patterns", "Energy and digestion connection", "Stress-related gut signals"],
  recommendation: "Use the Gi Bud app to unlock AI Tongue Analysis and get more personalized next-step guidance.",
};

function computeGutScore(answers) {
  const total = surveyQuestions.reduce((sum, question) => {
    const answer = Number(answers[question.id] || 0);
    const normalized = question.invert ? 6 - answer : answer;
    return sum + normalized;
  }, 0);

  const maxScore = surveyQuestions.length * 5;
  return Math.round((total / maxScore) * 100);
}

function getScoreLabel(score) {
  return scoreLabels.find((label) => score >= label.min) ?? scoreLabels[scoreLabels.length - 1];
}

function getScoreTheme(score) {
  if (score >= 85) {
    return {
      cardClass: "bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-200",
      bodyClass: "text-emerald-50",
      scoreTint: "text-emerald-100",
    };
  }

  if (score >= 70) {
    return {
      cardClass: "bg-gradient-to-br from-lime-400 to-green-600 shadow-lime-200",
      bodyClass: "text-lime-50",
      scoreTint: "text-lime-100",
    };
  }

  if (score >= 50) {
    return {
      cardClass: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200",
      bodyClass: "text-amber-50",
      scoreTint: "text-amber-100",
    };
  }

  return {
    cardClass: "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-200",
    bodyClass: "text-rose-50",
    scoreTint: "text-rose-100",
  };
}

function buildLocalInsightSummary(score, answers) {
  const signals = [];

  if (Number(answers.bloatingAfterMeals) >= 4) {
    signals.push("post-meal bloating");
  }

  if (Number(answers.stomachDiscomfort) >= 4) {
    signals.push("frequent stomach discomfort");
  }

  if (Number(answers.stressImpact) >= 4) {
    signals.push("stress-linked digestion changes");
  }

  if (Number(answers.energyLevels) <= 2) {
    signals.push("lower daily energy");
  }

  if (Number(answers.bowelRegularity) <= 2) {
    signals.push("irregular digestion");
  }

  if (Number(answers.mealComfort) <= 2) {
    signals.push("reduced comfort after meals");
  }

  const focusAreas = signals.slice(0, 3);

  return {
    headline:
      score >= 75
        ? "Your answers point to a fairly stable gut baseline"
        : "Your answers suggest a few digestive patterns to watch",
    summary:
      focusAreas.length > 0
        ? `We noticed signals around ${focusAreas.join(", ")}. A more detailed in-app analysis can help identify likely triggers and what to improve first.`
        : fallbackInsights.summary,
    focusAreas: focusAreas.length > 0 ? focusAreas : fallbackInsights.focusAreas,
    recommendation:
      score >= 75
        ? "You seem to have a healthy starting point. Use the app to validate what is working well and catch hidden trends early."
        : fallbackInsights.recommendation,
  };
}

function parseJsonFromText(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function generateGeminiInsight(formData, gutScore) {
  if (!GEMINI_API_KEY) {
    return buildLocalInsightSummary(gutScore, formData);
  }

  const prompt = `
You are generating a short, friendly gut health event insight for a mobile lead capture page.
Use the survey answers below to produce a lightweight wellness snapshot. Do not diagnose, do not mention disease, and do not make medical claims.
Keep it encouraging, concise, and action-oriented.

Return strict JSON only in this exact shape:
{
  "headline": "string",
  "summary": "string",
  "focusAreas": ["string", "string", "string"],
  "recommendation": "string"
}

Survey answers:
- Name: ${formData.name}
- Age: ${formData.age}
- Phone Number Provided: ${formData.phoneNumber ? "yes" : "no"}
- Bloating After Meals (1-5, higher = worse): ${formData.bloatingAfterMeals}
- Energy Levels (1-5, higher = better): ${formData.energyLevels}
- Digestion Regularity (1-5, higher = better): ${formData.bowelRegularity}
- Stomach Discomfort Frequency (1-5, higher = worse): ${formData.stomachDiscomfort}
- Stress Impact On Digestion (1-5, higher = worse): ${formData.stressImpact}
- Comfort After Meals (1-5, higher = better): ${formData.mealComfort}
- Gut Score: ${gutScore}/100
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Gemini request failed");
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = parseJsonFromText(text);

    if (
      !parsed ||
      typeof parsed.headline !== "string" ||
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.focusAreas) ||
      typeof parsed.recommendation !== "string"
    ) {
      throw new Error("Gemini response parsing failed");
    }

    return {
      headline: parsed.headline,
      summary: parsed.summary,
      focusAreas: parsed.focusAreas.slice(0, 3),
      recommendation: parsed.recommendation,
    };
  } catch {
    return buildLocalInsightSummary(gutScore, formData);
  }
}

function App() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gutScore, setGutScore] = useState(null);
  const [analysis, setAnalysis] = useState(fallbackInsights);

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  useEffect(() => {
    if (step !== 3) {
      return undefined;
    }

    let isMounted = true;
    const runSubmission = async () => {
      const score = computeGutScore(formData);
      setSubmissionError("");
      setIsSubmitting(true);

      try {
        const [aiAnalysis] = await Promise.all([
          generateGeminiInsight(formData, score),
          addDoc(collection(db, COLLECTION_NAME), {
            ...formData,
            age: Number(formData.age),
            gutScore: score,
            source: "standee",
            createdAt: serverTimestamp(),
          }),
          new Promise((resolve) => {
            window.setTimeout(resolve, 3000);
          }),
        ]);

        if (!isMounted) {
          return;
        }

        setAnalysis(aiAnalysis);
        setGutScore(score);
        setStep(4);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setSubmissionError("We couldn't save your survey right now. Please try again.");
        setStep(2);
      } finally {
        if (isMounted) {
          setIsSubmitting(false);
        }
      }
    };

    runSubmission();

    return () => {
      isMounted = false;
    };
  }, [formData, step]);

  const scoreMeta = gutScore !== null ? getScoreLabel(gutScore) : null;
  const scoreTheme = gutScore !== null ? getScoreTheme(gutScore) : null;

  const handleInputChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: "",
    }));
  };

  const validateStepOne = () => {
    const nextErrors = {};

    if (!formData.name.trim()) {
      nextErrors.name = "Please enter your name.";
    }

    if (!formData.age || Number(formData.age) < 1) {
      nextErrors.age = "Please enter a valid age.";
    }

    if (formData.phoneNumber && !/^[0-9+\-\s]{8,15}$/.test(formData.phoneNumber.trim())) {
      nextErrors.phoneNumber = "Please enter a valid phone number or leave it blank.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStepTwo = () => {
    const nextErrors = {};

    surveyQuestions.forEach((question) => {
      if (!formData[question.id]) {
        nextErrors[question.id] = "Please choose an answer.";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStepOne()) {
      setStep(2);
    }

    if (step === 2 && validateStepTwo()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setSubmissionError("");
    setStep((current) => Math.max(1, current - 1));
  };

  const handleRestart = () => {
    setFormData(initialFormData);
    setErrors({});
    setSubmissionError("");
    setGutScore(null);
    setAnalysis(fallbackInsights);
    setStep(1);
  };

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md flex-col justify-center">
        <section className="glass-card overflow-hidden">
          <div className="h-1.5 w-full bg-emerald-50">
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
            <div className="mb-6">
              <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                GrowGut Health Check
              </div>
              <h1 className="mt-4 text-[2rem] font-bold leading-tight text-slate-900">
                Discover your gut wellness snapshot in under 1 minute
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Take this quick event-only survey and unlock your AI Tongue Analysis inside the Gi Bud app.
              </p>
            </div>

            {submissionError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {submissionError}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="name">
                    Name <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(event) => handleInputChange("name", event.target.value)}
                    placeholder="Enter your full name"
                    className="field-shell w-full"
                  />
                  {errors.name ? <p className="mt-2 text-sm text-rose-600">{errors.name}</p> : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="age">
                    Age <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    id="age"
                    type="number"
                    min="1"
                    value={formData.age}
                    onChange={(event) => handleInputChange("age", event.target.value)}
                    placeholder="Your age"
                    className="field-shell w-full"
                  />
                  {errors.age ? <p className="mt-2 text-sm text-rose-600">{errors.age}</p> : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="phoneNumber">
                    Phone Number <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(event) => handleInputChange("phoneNumber", event.target.value)}
                    className="field-shell w-full"
                  />
                  {errors.phoneNumber ? <p className="mt-2 text-sm text-rose-600">{errors.phoneNumber}</p> : null}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                {surveyQuestions.map((question, questionIndex) => (
                  <div key={question.id} className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Question {questionIndex + 1}
                      </p>
                      <h2 className="mt-1 text-base font-semibold leading-6 text-slate-900">
                        {question.title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">{question.helper}</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const isActive = formData[question.id] === value;

                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleInputChange(question.id, value)}
                            className={`scale-chip ${isActive ? "scale-chip-active" : ""}`}
                            aria-pressed={isActive}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                      <span>{question.minLabel}</span>
                      <span>{question.maxLabel}</span>
                    </div>

                    {errors[question.id] ? (
                      <p className="mt-3 text-sm text-rose-600">{errors[question.id]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50">
                  <div className="absolute inset-0 animate-ping rounded-full bg-emerald-200/80" />
                  <div className="relative h-16 w-16 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Calculating your results...</h2>
                <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">
                  We’re turning your answers into a quick gut wellness snapshot and preparing your next step.
                </p>
                {isSubmitting ? (
                  <div className="mt-5 inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                    Analyzing symptoms, habits, and patterns
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 4 && scoreMeta && scoreTheme ? (
              <div className="space-y-5">
                <div className={`rounded-[28px] px-5 py-6 text-white shadow-xl ${scoreTheme.cardClass}`}>
                  <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${scoreTheme.bodyClass}`}>
                    Your Snapshot
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-bold">{gutScore}</span>
                    <span className={`pb-1 text-lg font-semibold ${scoreTheme.scoreTint}`}>/100</span>
                  </div>
                  <h2 className="mt-4 text-2xl font-bold">{scoreMeta.title}</h2>
                  <p className={`mt-2 text-sm leading-6 ${scoreTheme.bodyClass}`}>{scoreMeta.description}</p>
                </div>

                <div className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    AI-powered read
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{analysis.headline}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.summary}</p>

                  <div className="mt-4 grid gap-2">
                    {analysis.focusAreas.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-600">{analysis.recommendation}</p>
                </div>

                <div className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-[#8E1027] shadow-lg shadow-rose-200">
                      <img src={giBudLogo} alt="Gi Bud logo" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Gi Bud app
                      </p>
                      <h3 className="mt-1 text-2xl font-bold text-slate-900">Unlock your AI Tongue Analysis</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Download the Gi Bud app to get a deeper, personalized view of your gut health and next-best actions.
                  </p>

                  <div className="mt-5">
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="cta-button bg-emerald-500 text-white hover:bg-emerald-600"
                    >
                      Get it on Google Play
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRestart}
                  className="w-full rounded-2xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Start another survey
                </button>
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              {step > 1 && step < 4 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 rounded-2xl border border-emerald-200 px-4 py-4 text-base font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Back
                </button>
              ) : null}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="cta-button flex-1 bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  {step === 1 ? "Continue" : "See my snapshot"}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
