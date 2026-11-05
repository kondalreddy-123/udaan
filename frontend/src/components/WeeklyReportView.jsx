import React from 'react';

const LOCALES = { te: 'te-IN', en: 'en-IN', hi: 'hi-IN' };

function formatDate(value, lang) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(LOCALES[lang] || 'en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (err) {
    return date.toDateString();
  }
}

function ListBlock({ icon, title, items, emptyText }) {
  return (
    <section className="pc-list-block">
      <h3 className="pc-list-title">
        <span aria-hidden="true">{icon}</span> {title}
      </h3>
      {items && items.length > 0 ? (
        <ul className="pc-list">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="po-small pc-muted">{emptyText}</p>
      )}
    </section>
  );
}

/**
 * Shared, read-only rendering of one weekly report.
 *
 * Used both by the authenticated ParentConnect tab and by the public secure
 * link viewer, so the parent sees exactly the same real statistics in both.
 */
export default function WeeklyReportView({
  report,
  lang = 'en',
  t,
  onBack,
  actions = null,
  publicMode = false,
}) {
  const tr = (key, replacements) => {
    let text = typeof t === 'function' ? t(key) : key;
    if (replacements) {
      Object.keys(replacements).forEach((name) => {
        text = String(text).split(`{${name}}`).join(String(replacements[name]));
      });
    }
    return text;
  };

  if (!report) return null;

  const activity = report.activity || {};
  const topics = Array.isArray(report.topics) ? report.topics : [];
  const inactive = Boolean(report.inactive);
  const weekLabel = report.week_label || `${report.week_start || ''} – ${report.week_end || ''}`;

  const metrics = [
    { icon: '🎯', value: activity.lessons_completed ?? 0, label: tr('pvLessonsCompleted') },
    { icon: '🧩', value: activity.quizzes_attempted ?? 0, label: tr('pvPracticeSets') },
    { icon: '❓', value: activity.questions_attempted ?? 0, label: tr('pvQuestions') },
    { icon: '✅', value: `${activity.accuracy_pct ?? 0}%`, label: tr('pvAccuracy') },
    {
      icon: '⏱️',
      value: `${activity.learning_minutes ?? 0} ${tr('pvMinutes')}`,
      label: tr('pvLearningTime'),
    },
    { icon: '📅', value: activity.active_days ?? 0, label: tr('pvActiveDays') },
  ];

  return (
    <article className={`pc-report ${publicMode ? 'pc-report-public' : ''}`} aria-labelledby="pc-report-title">
      <header className="pc-report-head">
        {onBack && (
          <button type="button" className="sec pc-back" onClick={onBack}>
            ← {tr('pcBackToReports')}
          </button>
        )}
        <div className="pc-report-headline">
          <p className="pc-eyebrow">UDAAN ParentConnect</p>
          <h2 id="pc-report-title">
            {tr('pvReportFor')} {report.student_name}
          </h2>
          <p className="po-sub">
            {tr('pvWeek')}: <b>{weekLabel}</b>
            {report.class_name ? ` · ${report.class_name}` : ''}
          </p>
        </div>
        <span className={`pc-chip ${inactive ? 'muted' : 'ok'}`}>
          {inactive ? tr('pcInactive') : tr('pcActive')}
        </span>
      </header>

      {inactive ? (
        <div className="pc-inactive" role="note">
          <h3>{tr('pvInactiveTitle')}</h3>
          <p>{tr('pvInactiveBody')}</p>
        </div>
      ) : (
        <>
          <div className="pc-metrics" aria-label={tr('pvTopicBreakdown')}>
            {metrics.map((metric) => (
              <div className="pc-metric" key={metric.label}>
                <span className="pc-metric-icon" aria-hidden="true">{metric.icon}</span>
                <span className="pc-metric-value">{metric.value}</span>
                <span className="pc-metric-label">{metric.label}</span>
              </div>
            ))}
          </div>

          <section className="pc-topics">
            <h3 className="pc-section-title">{tr('pvTopicBreakdown')}</h3>
            {topics.length === 0 ? (
              <p className="po-small pc-muted">{tr('pvNoItems')}</p>
            ) : (
              <div className="pc-table-wrap">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th scope="col">{tr('pvTopic')}</th>
                      <th scope="col">{tr('pvAttempts')}</th>
                      <th scope="col">{tr('pvAccuracy')}</th>
                      <th scope="col">{tr('pvMastery')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((topic) => (
                      <tr key={topic.concept_id || topic.title}>
                        <td>{topic.title}</td>
                        <td>{topic.attempts ?? 0}</td>
                        <td>{topic.accuracy_pct ?? 0}%</td>
                        <td>{topic.mastery_pct ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="pc-list-grid">
            <ListBlock
              icon="💪"
              title={tr('pvStrengths')}
              items={report.strengths}
              emptyText={tr('pvNoItems')}
            />
            <ListBlock
              icon="📈"
              title={tr('pvImprovements')}
              items={report.improvements}
              emptyText={tr('pvNoItems')}
            />
            <ListBlock
              icon="🎯"
              title={tr('pvNeedsPractice')}
              items={report.needs_practice}
              emptyText={tr('pvNoItems')}
            />
          </div>

          {report.comparison ? (
            <section className="pc-comparison" aria-label={tr('pvWeek')}>
              <h3 className="pc-section-title">↔️ {tr('pvWeek')}</h3>
              <p className="pc-comparison-headline">{report.comparison.headline}</p>
              <p className="pc-muted">{report.comparison.summary}</p>
            </section>
          ) : (
            <p className="po-small pc-muted">{tr('pvNoComparison')}</p>
          )}
        </>
      )}

      <section className="pc-recommendations">
        <h3 className="pc-section-title">🤖 {tr('pvRecommendations')}</h3>
        {report.recommendations && report.recommendations.length > 0 ? (
          <ul className="pc-list pc-list-rec">
            {report.recommendations.map((item, index) => (
              <li key={`rec-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="po-small pc-muted">{tr('pvNoItems')}</p>
        )}
      </section>

      {actions && <div className="pc-actions">{actions}</div>}

      <footer className="pc-report-foot">
        <span>
          {tr('pvGenerated')}
          {report.generated_at ? `: ${formatDate(report.generated_at, lang)}` : ''}
        </span>
        {publicMode && (
          <>
            <span>{tr('pvPublicFooter')}</span>
            {report.token_expires_at && (
              <span>
                {tr('pvLinkExpires')}: {formatDate(report.token_expires_at, lang)}
              </span>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
