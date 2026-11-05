import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import WeeklyReportView from './WeeklyReportView';

/**
 * Public, read-only weekly report viewer (Phase 5).
 *
 * Rendered when the app URL contains ?report_token=... so a parent can read a
 * report from a verified email/SMS link without logging in. The token is
 * random, expiring, and can be revoked or rotated by the parent.
 */
export default function PublicReportView({ token, lang = 'en', t }) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError(tr('pcPublicInvalid'));
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    api
      .getPublicWeeklyReport(token)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || tr('pcPublicInvalid'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="pc-public" role="main">
      <div className="pc-public-card">
        <div className="pc-public-brand">
          <span aria-hidden="true">✈️</span> UDAAN
          <span className="pc-public-brand-sub">ParentConnect</span>
        </div>

        {loading && <p className="po-sub" role="status">{tr('pcSaving')}</p>}

        {!loading && error && (
          <div className="pc-public-error" role="alert">
            <h1>{tr('pcPublicTitle')}</h1>
            <p>{error || tr('pcPublicInvalid')}</p>
            <p className="po-small pc-muted">{tr('pcPublicHelp')}</p>
          </div>
        )}

        {!loading && !error && report && (
          <>
            <p className="po-small pc-muted pc-public-intro">{tr('pcPublicIntro')}</p>
            <WeeklyReportView
              report={report}
              lang={report.language || lang}
              t={t}
              publicMode
            />
          </>
        )}
      </div>
    </main>
  );
}
