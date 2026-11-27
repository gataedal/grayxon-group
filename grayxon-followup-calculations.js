/* Pure calculation helpers for Grayxon creator follow-up. No database or DOM access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GRAYXON_FOLLOWUP_CALCULATIONS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY_MS = 86400000;
  const parseDate = value => {
    if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [y,m,d] = String(value).split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? date : null;
  };
  const iso = date => date.toISOString().slice(0,10);
  const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
  const maxDate = (a,b) => a>b?a:b;
  const minDate = (a,b) => a<b?a:b;

  function calculateEvaluation(input) {
    const start = parseDate(input.periodStart);
    const end = parseDate(input.periodEnd);
    const joined = input.joinDate ? parseDate(input.joinDate) : null;
    if (!start || !end || start>end) return {status:'invalid_period', reason:'El rango de evaluación no es válido.'};
    if (input.joinDate && !joined) return {status:'invalid_join_date', reason:'La fecha de incorporación no es válida.'};

    const coverageStart = input.coverageStart ? parseDate(input.coverageStart) : null;
    const coverageEnd = input.coverageEnd ? parseDate(input.coverageEnd) : null;
    if (input.granularity === 'period_aggregate' &&
        (!coverageStart || !coverageEnd || iso(start)!==iso(coverageStart) || iso(end)!==iso(coverageEnd))) {
      return {status:'needs_daily_data', reason:'El archivo contiene un acumulado de otro rango; no es posible separar la actividad por días.'};
    }
    if (input.granularity === 'unknown') {
      return {status:'needs_daily_data', reason:'No se pudo verificar la granularidad del reporte.'};
    }

    const evaluableStart = joined ? maxDate(start, joined) : start;
    if (evaluableStart>end) {
      return {status:'not_evaluable', reason:'El creador aún no pertenecía a Grayxon durante el período seleccionado.', evaluableDays:0};
    }

    const monthlyHours = Number(input.monthlyLiveHours ?? 90);
    const monthlyDays = Number(input.monthlyValidDays ?? 22);
    if (!Number.isFinite(monthlyHours) || monthlyHours<0 || !Number.isFinite(monthlyDays) || monthlyDays<0) {
      return {status:'invalid_parameters', reason:'Las metas mensuales configuradas no son válidas.'};
    }

    let evaluableDays=0, targetDays=0, targetLiveSeconds=0;
    for (let cursor=new Date(evaluableStart); cursor<=end;) {
      const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),1));
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0));
      const segmentEnd = minDate(end,monthEnd);
      const daysInMonth = monthEnd.getUTCDate();
      const segmentDays = Math.floor((segmentEnd-cursor)/DAY_MS)+1;
      evaluableDays += segmentDays;
      targetDays += monthlyDays * segmentDays / daysInMonth;
      targetLiveSeconds += monthlyHours * 3600 * segmentDays / daysInMonth;
      cursor = addDays(segmentEnd,1);
    }

    const validDays = input.validLiveDays == null ? null : Number(input.validLiveDays);
    const liveSeconds = input.liveSeconds == null ? null : Number(input.liveSeconds);
    if ((validDays!=null && (!Number.isFinite(validDays)||validDays<0)) ||
        (liveSeconds!=null && (!Number.isFinite(liveSeconds)||liveSeconds<0))) {
      return {status:'invalid_metrics', reason:'El reporte contiene métricas negativas o no numéricas.'};
    }
    if (validDays==null || liveSeconds==null) {
      return {status:'not_evaluable', reason:'Faltan métricas de días válidos u horas LIVE para evaluar el cumplimiento.', evaluableDays, targetValidDays:targetDays, targetLiveSeconds};
    }

    const validDaysPct = targetDays>0 ? validDays/targetDays*100 : 100;
    const liveHoursPct = targetLiveSeconds>0 ? liveSeconds/targetLiveSeconds*100 : 100;
    const minimumDays = Number(input.earlyReviewMinDays ?? 5);
    let classification;
    if (evaluableDays<minimumDays) classification='early_review';
    else if (validDaysPct<Number(input.highRiskThresholdPct ?? 50) || liveHoursPct<Number(input.highRiskThresholdPct ?? 50)) classification='high_risk';
    else if (validDaysPct<Number(input.observationThresholdPct ?? 80) || liveHoursPct<Number(input.observationThresholdPct ?? 80)) classification='observation';
    else classification='on_track';

    return {
      status:'evaluated', classification,
      evaluatedStart:iso(evaluableStart), evaluatedEnd:iso(end), evaluableDays,
      validLiveDays:validDays, liveSeconds,
      targetValidDays:Number(targetDays.toFixed(4)), targetLiveSeconds:Number(targetLiveSeconds.toFixed(2)),
      missingValidDays:Math.max(0,Number((targetDays-validDays).toFixed(4))),
      missingLiveSeconds:Math.max(0,targetLiveSeconds-liveSeconds),
      validDaysPct:Number(validDaysPct.toFixed(4)), liveHoursPct:Number(liveHoursPct.toFixed(4)),
      consistencyRecommendation:{hoursPerDay:Number(input.consistencyHoursPerDay ?? 2.5),daysPerWeek:Number(input.consistencyDaysPerWeek ?? 6)}
    };
  }

  function toBogotaISOString(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const [, year, month, day, hour, minute] = match.map((part, index) => index ? Number(part) : part);
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
    const localDate = new Date(Date.UTC(year, month - 1, day));
    if (localDate.getUTCFullYear() !== year || localDate.getUTCMonth() !== month - 1 || localDate.getUTCDate() !== day) return null;
    // Colombia uses UTC-5; build the instant explicitly so the device timezone is irrelevant.
    return new Date(Date.UTC(year, month - 1, day, hour + 5, minute)).toISOString();
  }

  return { calculateEvaluation, parseDate, toBogotaISOString };
});
