import { useState } from "react";
import { useLanguage } from "../features/language/LanguageProvider";

const tierBadgeLogos = {
  bronze: "/eqx_digital-learning-badges_CustomerOps_Bronze.png",
  silver: "/Customer%20Operations%20-%20Silver%20Badge%20Cross%20Connects.svg",
  gold: "/Customer%20Operations%20-%20Gold%20Badge%20Troubleshooting.svg"
} as const;

const content = {
  en: {
    heroEyebrow: "Equinix Learning & Development",
    heroTitle: "Welcome to the Bronze Badge Program!",
    heroLead:
      "Equinix\u2019s badging program offers Operations employees structured learning pathways for their development after Onboarding. A bronze badge will signify that you have demonstrated the knowledge and skills necessary to perform the basic-level job tasks for your role.",
    heroBadgeAreas:
      "The Bronze program issues badges in two main areas of Data Centre Operations: Critical Facilities Management, and Customer Operations. Each badge consists of several subject areas that are relevant to your role.",
    heroEarn:
      "To earn a badge, you must complete all of the associated topics within the curriculum. Once completed, this badge will be visible in ELC as well as the Hub.",
    downloadLabel: "Download Original Files",
    downloadEn: "English Version",
    downloadDe: "German Version",
    downloadDeck: "Presentation Deck",
    badgeEyebrow: "Badge Areas",
    badgeTitle: "Two Main Areas of Operations",
    badgeSubtitle: "The Bronze program issues badges in two main areas of Data Centre Operations.",
    copsTitle: "Customer Operations",
    copsText:
      "The Customer Operations badge includes topics ranging from IBX Security and Cross Connects to Smart Hands and Trouble Tickets. The six topics included in the badge are designed to provide baseline knowledge and skills for all employees, resulting in consistent and efficient operational outcomes.",
    copsTopics: ["IBX Security", "Cross Connects", "Smart Hands", "Trouble Tickets", "Customer Service", "Safety"],
    cfmTitle: "Critical Facilities Management",
    cfmText:
      "Topics included in the Critical Facilities badge cover electrical, mechanical, and control systems, ensuring that employees are sufficiently well-versed across all systems for efficient monitoring and operations.",
    cfmTopics: ["Electrical Systems", "Mechanical Systems", "Control Systems", "Monitoring & Ops"],
    currEyebrow: "Curriculum",
    currTitle: "Badging Structure",
    currSubtitle:
      "Our curriculum is built on practical and adaptive learning principles with a heavy emphasis on real-world practice, ensuring you acquire knowledge at your point of need. The design incorporates:",
    currTabs: [
      {
        num: "01",
        short: "eLearning",
        title: "Self-paced eLearning",
        text: "Offering flexibility and control over your learning progress. Complete modules at your own pace, anytime and anywhere, adapting to your schedule and preferred learning style."
      },
      {
        num: "02",
        short: "Assessments",
        title: "Knowledge Assessments",
        text: "Validating theoretical understanding through structured assessments and quizzes. These ensure you have grasped the key concepts before moving on to practical application."
      },
      {
        num: "03",
        short: "OJTs",
        title: "On-the-Job Training (OJTs)",
        text: "Hands-on application facilitated by Subject Matter Expert (SME) Instructors. This is the step managed by this platform \u2014 real-world practice in your actual work environment, guided by experienced colleagues."
      },
      {
        num: "04",
        short: "OCLs",
        title: "Comprehensive Skills Assessments (OCLs)",
        text: "Ensuring competency before certification. Also known as Observational Checklists (OCLs), these final assessments validate that you can perform tasks independently and to standard."
      }
    ],
    journeyEyebrow: "Journey",
    journeyTitle: "From Assignment to Badge Award",
    journeySubtitle:
      "The presentation adds the operational path around the curriculum: how learners enter the program, how practice is delivered, and what happens before the badge is awarded.",
    journeySteps: [
      {
        num: "01",
        title: "Onboarding and assignment",
        text: "New hires or existing employees are assigned into the Bronze badge path as part of role development planning."
      },
      {
        num: "02",
        title: "Pre-assessment",
        text: "A Bronze pre-assessment establishes the starting point and can help identify whether a learner may fast-track or needs more preparation."
      },
      {
        num: "03",
        title: "eLearning and post-assessment",
        text: "Learners complete the digital modules in ELC and confirm understanding before moving into hands-on delivery."
      },
      {
        num: "04",
        title: "On-the-Job Training",
        text: "Field Instructors guide learners through the real work, best practices, and site context needed for operational readiness."
      },
      {
        num: "05",
        title: "Skill assessment and OCL",
        text: "Observational Checklists verify that the learner can perform tasks fairly, consistently, and to the expected standard."
      },
      {
        num: "06",
        title: "Badge earned",
        text: "After successful completion and verification, the Bronze badge is awarded and becomes visible in the learning systems."
      }
    ],
    journeyStats: [
      "Customer Operations Bronze: 4-12 months",
      "Critical Facilities Bronze: 9-18 months",
      "Badge expiration: 2 years from issue"
    ],
    instructorEyebrow: "Field Instructors",
    instructorTitle: "What the Presentation Expects from Instructors",
    instructorLead:
      "The deck makes the Field Instructor role explicit because the quality of OJT and assessment depends on preparation, consistency, and tracking.",
    instructorChecklist: [
      "Identify learners with your manager or site lead and request enrollment.",
      "Prepare and schedule OJT sessions with site leads and Regional Training Managers.",
      "Cover all OJT objectives, add site-specific process context, and confirm learner understanding.",
      "Prepare and run OCL assessments fairly and consistently.",
      "Track completions in the roster sheet and submit results to the Regional Training Manager."
    ],
    instructorGoalsTitle: "Deployment goals highlighted in the presentation",
    instructorGoals: [
      "100% of identified Field Instructors badged during the GOA visit.",
      "70% of existing staff badged across the following 12 months.",
      "All new hires enrolled into badging from April 2026 onward."
    ],
    benEyebrow: "Benefits",
    benTitle: "How This Benefits You",
    benefits: [
      {
        icon: "medal",
        title: "Professional Recognition",
        text: "Earning a badge offers you an opportunity to be recognised for your skills and expertise, increasing your visibility in the organisation and demonstrating your qualification for new opportunities."
      },
      {
        icon: "chart",
        title: "Skills Development",
        text: "The three badge tiers \u2013 Bronze, Silver, and Gold \u2013 provide a structured plan to grow your skills, helping you progress from foundational knowledge to mastery in your chosen field."
      },
      {
        icon: "clock",
        title: "Relevant and Timely Training",
        text: "Training is directly applicable to your role, delivered as needed, and tailored to meet both your development needs and the needs of the business."
      },
      {
        icon: "book",
        title: "Empowering Leadership",
        text: "Managers will gain insights through analytics to better understand and support their teams\u2019 skillsets, capabilities, and development."
      }
    ],
    tierEyebrow: "Progression",
    tierTitle: "Badge Tiers",
    tierSubtitle: "To earn a badge, you must complete all of the associated topics within the curriculum.",
    tierBronze: "Foundational knowledge and basic-level job tasks",
    tierSilver: "Advanced skills and expanded responsibility",
    tierGold: "Mastery-level expertise and leadership capability",
    footer:
      "At Equinix, we are committed to building the best data centre workforce on earth. Our Badging programs are designed to provide progressive skill and knowledge development to learners."
  },
  de: {
    heroEyebrow: "Equinix Learning & Development",
    heroTitle: "Willkommen beim Bronze Badge Programm!",
    heroLead:
      "Das Badging-Programm von Equinix bietet Operations-Mitarbeitenden strukturierte Lernpfade für ihre Entwicklung nach dem Onboarding. Ein Bronze Badge zeigt, dass du die Kenntnisse und Fähigkeiten nachgewiesen hast, die für die grundlegenden Aufgaben deiner Rolle erforderlich sind.",
    heroBadgeAreas:
      "Das Bronze-Programm vergibt Badges in zwei Hauptbereichen des Rechenzentrums-Betriebs: Critical Facilities Management und Customer Operations. Jedes Badge besteht aus mehreren Themenbereichen, die für deine Rolle relevant sind.",
    heroEarn:
      "Um ein Badge zu erhalten, musst du alle zugehörigen Themen im Curriculum abschließen. Nach Abschluss ist das Badge im ELC sowie im Hub sichtbar.",
    downloadLabel: "Originaldateien herunterladen",
    downloadEn: "Englische Version",
    downloadDe: "Deutsche Version",
    downloadDeck: "Präsentations-Deck",
    badgeEyebrow: "Badge-Bereiche",
    badgeTitle: "Zwei Hauptbereiche des Betriebs",
    badgeSubtitle: "Das Bronze-Programm vergibt Badges in zwei Hauptbereichen des Rechenzentrums-Betriebs.",
    copsTitle: "Customer Operations",
    copsText:
      "Das Customer Operations Badge umfasst Themen von IBX-Sicherheit und Cross Connects bis hin zu Smart Hands und Trouble Tickets. Die sechs enthaltenen Themen sollen allen Mitarbeitenden grundlegendes Wissen und Fähigkeiten vermitteln und so konsistente und effiziente betriebliche Ergebnisse sicherstellen.",
    copsTopics: ["IBX-Sicherheit", "Cross Connects", "Smart Hands", "Trouble Tickets", "Kundenservice", "Arbeitssicherheit"],
    cfmTitle: "Critical Facilities Management",
    cfmText:
      "Die Themen des Critical Facilities Badge decken elektrische, mechanische und Steuerungssysteme ab und stellen sicher, dass Mitarbeitende in allen Systemen ausreichend versiert sind, um einen effizienten Betrieb und ein effizientes Monitoring zu gewährleisten.",
    cfmTopics: ["Elektrische Systeme", "Mechanische Systeme", "Steuerungssysteme", "Monitoring & Betrieb"],
    currEyebrow: "Curriculum",
    currTitle: "Aufbau des Programms",
    currSubtitle:
      "Unser Curriculum basiert auf praktischen und adaptiven Lernprinzipien mit starkem Fokus auf Praxisnähe. Du erwirbst Wissen genau dann, wenn du es brauchst. Das Design umfasst:",
    currTabs: [
      {
        num: "01",
        short: "eLearning",
        title: "Selbstgesteuertes eLearning",
        text: "Flexible Lernmodule, die du in deinem eigenen Tempo absolvieren kannst \u2014 jederzeit und überall, angepasst an deinen Zeitplan und bevorzugten Lernstil."
      },
      {
        num: "02",
        short: "Prüfungen",
        title: "Wissenstests",
        text: "Validierung des theoretischen Verständnisses durch strukturierte Tests und Quizze. Diese stellen sicher, dass du die Kernkonzepte verstanden hast, bevor du zur praktischen Anwendung übergehst."
      },
      {
        num: "03",
        short: "OJTs",
        title: "On-the-Job Training (OJTs)",
        text: "Praktische Anwendung unter Anleitung von Subject Matter Expert (SME) Instructors. Dieser Schritt wird von dieser Plattform verwaltet \u2014 praxisnahe Übungen in deiner realen Arbeitsumgebung, begleitet von erfahrenen Kollegen."
      },
      {
        num: "04",
        short: "OCLs",
        title: "Umfassende Kompetenzprüfungen (OCLs)",
        text: "Sicherstellung der Kompetenz vor der Zertifizierung. Auch als Observational Checklists (OCLs) bekannt, validieren diese Abschlussprüfungen, dass du Aufgaben selbstständig und standardgemäß ausführen kannst."
      }
    ],
    journeyEyebrow: "Lernpfad",
    journeyTitle: "Von der Zuweisung bis zum Badge",
    journeySubtitle:
      "Die Präsentation ergänzt das Curriculum um den operativen Ablauf: wie Lernende in das Programm kommen, wie die Praxis begleitet wird und was vor der Badge-Vergabe passiert.",
    journeySteps: [
      {
        num: "01",
        title: "Onboarding und Zuweisung",
        text: "Neue oder bestehende Mitarbeitende werden im Rahmen ihrer Rollenentwicklung dem Bronze-Badge-Pfad zugeordnet."
      },
      {
        num: "02",
        title: "Pre-Assessment",
        text: "Ein Bronze-Pre-Assessment bestimmt den Ausgangspunkt und zeigt, ob jemand schneller voranschreiten kann oder mehr Vorbereitung benötigt."
      },
      {
        num: "03",
        title: "eLearning und Post-Assessment",
        text: "Lernende absolvieren die digitalen Module im ELC und bestätigen ihr Verständnis, bevor der praktische Teil beginnt."
      },
      {
        num: "04",
        title: "On-the-Job Training",
        text: "Field Instructors begleiten die Lernenden in der realen Arbeitspraxis inklusive Best Practices und standortspezifischem Kontext."
      },
      {
        num: "05",
        title: "Skill Assessment und OCL",
        text: "Observational Checklists prüfen fair und konsistent, ob Aufgaben sicher und gemäß Standard ausgeführt werden können."
      },
      {
        num: "06",
        title: "Badge erhalten",
        text: "Nach erfolgreichem Abschluss und Verifizierung wird das Bronze Badge vergeben und in den Lernsystemen sichtbar."
      }
    ],
    journeyStats: [
      "Customer Operations Bronze: 4-12 Monate",
      "Critical Facilities Bronze: 9-18 Monate",
      "Gültigkeit des Badge: 2 Jahre ab Ausstellung"
    ],
    instructorEyebrow: "Field Instructors",
    instructorTitle: "Was die Präsentation von Instructors erwartet",
    instructorLead:
      "Die Rolle des Field Instructors wird im Deck klar hervorgehoben, weil die Qualität von OJT und Assessment direkt von Vorbereitung, Konsistenz und sauberem Tracking abhängt.",
    instructorChecklist: [
      "Lernende gemeinsam mit Manager oder Site Lead identifizieren und zur Einschreibung anmelden.",
      "OJT-Sessions mit Site Leads und Regional Training Managers vorbereiten und terminieren.",
      "Alle OJT-Ziele abdecken, standortspezifischen Kontext ergänzen und das Verständnis der Lernenden bestätigen.",
      "OCL-Assessments vorbereitet, fair und konsistent durchführen.",
      "Abschlüsse im Roster Sheet dokumentieren und an den Regional Training Manager übermitteln."
    ],
    instructorGoalsTitle: "Im Deck hervorgehobene Einführungsziele",
    instructorGoals: [
      "100% der identifizierten Field Instructors während des GOA-Besuchs badgen.",
      "70% der bestehenden Mitarbeitenden in den folgenden 12 Monaten badgen.",
      "Alle neuen Mitarbeitenden ab April 2026 ins Badging aufnehmen."
    ],
    benEyebrow: "Vorteile",
    benTitle: "Dein Nutzen",
    benefits: [
      {
        icon: "medal",
        title: "Professionelle Anerkennung",
        text: "Ein Badge bietet dir die Möglichkeit, für deine Fähigkeiten und Expertise anerkannt zu werden, deine Sichtbarkeit in der Organisation zu erhöhen und deine Qualifikation für neue Möglichkeiten zu demonstrieren."
      },
      {
        icon: "chart",
        title: "Kompetenzentwicklung",
        text: "Die drei Badge-Stufen \u2013 Bronze, Silber und Gold \u2013 bieten einen strukturierten Plan zur Weiterentwicklung deiner Fähigkeiten, von grundlegendem Wissen bis hin zur Expertise in deinem gewählten Bereich."
      },
      {
        icon: "clock",
        title: "Relevantes und zeitnahes Training",
        text: "Das Training ist direkt auf deine Rolle anwendbar, wird bei Bedarf bereitgestellt und ist auf deine Entwicklungsbedürfnisse und die des Unternehmens zugeschnitten."
      },
      {
        icon: "book",
        title: "Führung stärken",
        text: "Manager erhalten durch Analysen Einblicke, um die Fähigkeiten, Kompetenzen und Entwicklung ihrer Teams besser zu verstehen und zu unterstützen."
      }
    ],
    tierEyebrow: "Progression",
    tierTitle: "Badge-Stufen",
    tierSubtitle: "Um ein Badge zu erhalten, musst du alle zugehörigen Themen im Curriculum abschließen.",
    tierBronze: "Grundlegendes Wissen und Basis-Aufgaben",
    tierSilver: "Fortgeschrittene Fähigkeiten und erweiterte Verantwortung",
    tierGold: "Expertenwissen und Führungskompetenz",
    footer:
      "Bei Equinix setzen wir uns dafür ein, die beste Rechenzentrums-Belegschaft der Welt aufzubauen. Unsere Badging-Programme sind darauf ausgelegt, Lernenden progressive Kompetenz- und Wissensentwicklung zu bieten."
  }
} as const;

const benefitIcons: Record<string, React.ReactNode> = {
  medal: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  chart: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  clock: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  book: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
};

export function ProgramInfo() {
  const { locale } = useLanguage();
  const [activeTab, setActiveTab] = useState(2);
  const lang = locale;
  const t = content[lang];

  return (
    <div className="program-info">
      {/* Hero */}
      <section className="program-hero">
        <div className="program-hero-inner">
          <div className="program-hero-badges">
            <img src="/eqx_digital-learning-badges_Instructor_SME.png" alt="Instructor SME Badge" className="program-hero-badge" />
          </div>
          <div className="program-hero-copy">
            <span className="eyebrow">{t.heroEyebrow}</span>
            <h1>{t.heroTitle}</h1>
            <p className="program-hero-lead">{t.heroLead}</p>
            <p className="program-hero-text">{t.heroBadgeAreas}</p>
            <p className="program-hero-text">{t.heroEarn}</p>
          </div>
        </div>
      </section>

      {/* PDF Downloads */}
      <section className="program-downloads">
        <span className="program-downloads-label">{t.downloadLabel}</span>
        <div className="program-downloads-btns">
          <a href="/Bronze Badge Overview.pdf" download className="btn program-download-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {t.downloadEn}
          </a>
          <a href="/What to Expect GOA Bronze Badge-German.pdf" download className="btn program-download-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {t.downloadDe}
          </a>
          <a href="/GOA--Badging Prep Deck (SLT)_GER.pptx" download className="btn program-download-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {t.downloadDeck}
          </a>
        </div>
      </section>

      {/* Badge Areas */}
      <section className="program-section">
        <div className="program-section-header">
          <span className="eyebrow">{t.badgeEyebrow}</span>
          <h2>{t.badgeTitle}</h2>
          <p>{t.badgeSubtitle}</p>
        </div>
        <div className="program-badge-grid">
          <div className="program-badge-card program-badge-card-cops">
            <div className="program-badge-card-img">
              <img src="/eqx_digital-learning-badges_CustomerOps_Bronze.png" alt="Customer Operations Badge" />
            </div>
            <h3>{t.copsTitle}</h3>
            <p>{t.copsText}</p>
            <div className="program-badge-topics">
              {t.copsTopics.map((topic) => <span key={topic}>{topic}</span>)}
            </div>
          </div>
          <div className="program-badge-card program-badge-card-cfm">
            <div className="program-badge-card-img">
              <img src="/eqx_digital-learning-badges_CriticalFacilities_Bronze.png" alt="Critical Facilities Badge" />
            </div>
            <h3>{t.cfmTitle}</h3>
            <p>{t.cfmText}</p>
            <div className="program-badge-topics">
              {t.cfmTopics.map((topic) => <span key={topic}>{topic}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* Curriculum Tabs */}
      <section className="program-section">
        <div className="program-section-header">
          <span className="eyebrow">{t.currEyebrow}</span>
          <h2>{t.currTitle}</h2>
          <p>{t.currSubtitle}</p>
        </div>
        <div className="program-curriculum-tabs">
          <div className="program-curriculum-tab-bar">
            {t.currTabs.map((tab, i) => (
              <button
                key={tab.num}
                type="button"
                className={`program-curriculum-tab ${activeTab === i ? "active" : ""} ${i === 2 ? "highlight" : ""}`}
                onClick={() => setActiveTab(i)}
              >
                <span className="program-curriculum-tab-num">{tab.num}</span>
                <span className="program-curriculum-tab-label">{tab.short}</span>
              </button>
            ))}
          </div>
          <div className="program-curriculum-panel">
            <div className="program-curriculum-panel-num">{t.currTabs[activeTab].num}</div>
            <h3>{t.currTabs[activeTab].title}</h3>
            <p>{t.currTabs[activeTab].text}</p>
            {activeTab === 2 && (
              <div className="program-curriculum-highlight-tag">
                {lang === "en" ? "Managed by this platform" : "Wird von dieser Plattform verwaltet"}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="program-section">
        <div className="program-section-header">
          <span className="eyebrow">{t.journeyEyebrow}</span>
          <h2>{t.journeyTitle}</h2>
          <p>{t.journeySubtitle}</p>
        </div>
        <div className="program-journey-layout">
          <div className="program-journey-main">
            <div className="program-journey-steps">
              {t.journeySteps.map((step) => (
                <div key={step.num} className="program-journey-step">
                  <div className="program-journey-step-num">{step.num}</div>
                  <div className="program-journey-step-copy">
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="program-journey-stats">
              {t.journeyStats.map((item) => (
                <span key={item} className="program-journey-stat">{item}</span>
              ))}
            </div>
          </div>
          <aside className="program-instructor-card">
            <span className="eyebrow">{t.instructorEyebrow}</span>
            <h3>{t.instructorTitle}</h3>
            <p className="program-instructor-lead">{t.instructorLead}</p>
            <ul className="program-instructor-list">
              {t.instructorChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="program-instructor-goals">
              <h4>{t.instructorGoalsTitle}</h4>
              <ul className="program-instructor-list compact">
                {t.instructorGoals.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>

      {/* Benefits */}
      <section className="program-section">
        <div className="program-section-header">
          <span className="eyebrow">{t.benEyebrow}</span>
          <h2>{t.benTitle}</h2>
        </div>
        <div className="program-benefits-grid">
          {t.benefits.map((b) => (
            <div key={b.icon} className="program-benefit-card">
              <div className="program-benefit-icon">{benefitIcons[b.icon]}</div>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="program-section">
        <div className="program-section-header">
          <span className="eyebrow">{t.tierEyebrow}</span>
          <h2>{t.tierTitle}</h2>
          <p>{t.tierSubtitle}</p>
        </div>
        <div className="program-tiers-row">
          <div className="program-tier program-tier-bronze">
            <div className="program-tier-badge">
              <img src={tierBadgeLogos.bronze} alt="Customer Operations Bronze Badge" className="program-tier-badge-img" />
            </div>
            <h3>Bronze</h3>
            <p>{t.tierBronze}</p>
          </div>
          <div className="program-tier-arrow">{"\u2192"}</div>
          <div className="program-tier program-tier-silver">
            <div className="program-tier-badge">
              <img src={tierBadgeLogos.silver} alt="Customer Operations Silver Badge" className="program-tier-badge-img" />
            </div>
            <h3>Silver</h3>
            <p>{t.tierSilver}</p>
          </div>
          <div className="program-tier-arrow">{"\u2192"}</div>
          <div className="program-tier program-tier-gold">
            <div className="program-tier-badge">
              <img src={tierBadgeLogos.gold} alt="Customer Operations Gold Badge" className="program-tier-badge-img" />
            </div>
            <h3>Gold</h3>
            <p>{t.tierGold}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="program-footer-section">
        <p>{t.footer}</p>
      </section>
    </div>
  );
}
