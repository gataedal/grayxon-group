/**
 * Grayxon · Seguimiento de creadores
 * Parser de previsualización para exportaciones XLSX de TikTok.
 * No realiza escrituras en Supabase ni modifica datos.
 */
(function (root) {
  'use strict';

  const HEADER_ALIASES = {
    username: ['nombre de usuario del creador', 'username', 'nombre de usuario'],
    creatorId: ['id del creador', 'creator id', 'id creador'],
    group: ['grupo', 'group'],
    agent: ['agente', 'agent'],
    joinedAt: ['hora de incorporación', 'fecha de incorporación', 'join date'],
    daysSinceJoin: ['días desde la incorporación', 'dias desde la incorporacion'],
    diamonds: ['diamantes', 'diamonds'],
    liveDuration: ['duración de live', 'duracion de live', 'live duration'],
    validDays: ['días válidos de emisiones live', 'dias validos de emisiones live', 'valid live days'],
    period: ['periodo de datos', 'período de datos', 'period', 'date range']
  };

  function normalizeHeader(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }
    const s = String(value == null ? '' : value).trim();
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) {
      const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3] ? date : null;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  function isoDate(d) {
    return d ? d.toISOString().slice(0, 10) : null;
  }

  function parsePeriod(value) {
    const s = String(value == null ? '' : value).trim();
    const m = /^(\d{4}-\d{2}-\d{2})\s*(?:~|a|al|hasta)\s*(\d{4}-\d{2}-\d{2})$/i.exec(s);
    if (m) {
      const start = parseDate(m[1]);
      const end = parseDate(m[2]);
      if (!start || !end || start > end) return null;
      return { start: isoDate(start), end: isoDate(end), label: s };
    }
    const d = parseDate(s);
    return d ? { start: isoDate(d), end: isoDate(d), label: s } : null;
  }

  function parseInteger(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? value : null;
    const s = String(value == null ? '' : value).trim().replace(/[.,\s]/g, '');
    return /^\d+$/.test(s) ? Number(s) : null;
  }

  function parseDurationHours(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0 ? value : null;
    const s = String(value == null ? '' : value).trim();
    const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*s)?$/i.exec(s);
    if (!match || !match[0].trim() || (!match[1] && !match[2] && !match[3])) return null;
    const minutes = Number(match[2] || 0), seconds = Number(match[3] || 0);
    if (minutes > 59 || seconds > 59) return null;
    return Number(match[1] || 0) + minutes / 60 + seconds / 3600;
  }

  function findColumns(headers) {
    const normalized = headers.map(normalizeHeader);
    const result = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const candidates = aliases.map(normalizeHeader);
      result[field] = normalized.findIndex(h => candidates.includes(h));
    }
    return result;
  }

  function parseWorkbook(workbook, selectedStart, selectedEnd) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) {
      throw new Error('El archivo no contiene hojas para leer.');
    }
    const XLSX = root.XLSX;
    if (!XLSX || !XLSX.utils || typeof XLSX.utils.sheet_to_json !== 'function') {
      throw new Error('No está disponible el lector de Excel. Recarga la página e inténtalo nuevamente.');
    }

    const rows = [];
    const warnings = [];
    const seen = new Set();
    const periods = new Map();
    let sheetUsed = null;
    let invalidPeriodRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
      if (!matrix.length) continue;
      const columns = findColumns(matrix[0] || []);
      if (columns.username < 0 || columns.period < 0) continue;
      sheetUsed = sheetName;

      for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        const username = String(row[columns.username] || '').trim().replace(/^@/, '');
        if (!username) continue;
        const period = parsePeriod(row[columns.period]);
        if (!period) {
          invalidPeriodRows++;
          warnings.push('Fila ' + (i + 1) + ': no se pudo interpretar el periodo.');
          continue;
        }
        periods.set(period.start + '|' + period.end, period);
        const key = username.toLowerCase();
        if (seen.has(key)) {
          warnings.push('Registro duplicado omitido: @' + username + '.');
          continue;
        }
        seen.add(key);
        const joined = columns.joinedAt >= 0 ? parseDate(row[columns.joinedAt]) : null;
        rows.push({
          username,
          creatorId: columns.creatorId >= 0 ? String(row[columns.creatorId] || '').trim() : null,
          group: columns.group >= 0 ? String(row[columns.group] || '').trim() : null,
          agent: columns.agent >= 0 ? String(row[columns.agent] || '').trim() : null,
          joinedAt: isoDate(joined),
          daysSinceJoin: columns.daysSinceJoin >= 0 ? parseInteger(row[columns.daysSinceJoin]) : null,
          diamonds: columns.diamonds >= 0 ? parseInteger(row[columns.diamonds]) : null,
          liveHours: columns.liveDuration >= 0 ? parseDurationHours(row[columns.liveDuration]) : null,
          validDays: columns.validDays >= 0 ? parseInteger(row[columns.validDays]) : null,
          sourcePeriod: period
        });
      }
      break;
    }

    if (!sheetUsed) throw new Error('No encontramos las columnas necesarias. Se requiere “Nombre de usuario del creador” y “Periodo de datos”.');
    if (!rows.length) throw new Error('No encontramos registros de creadores válidos en la hoja.');

    const start = isoDate(parseDate(selectedStart));
    const end = isoDate(parseDate(selectedEnd));
    if (!start || !end || start > end) throw new Error('Selecciona un rango de fechas válido.');

    const sourcePeriods = Array.from(periods.values());
    const mixedPeriods = sourcePeriods.length !== 1;
    const sourcePeriod = mixedPeriods ? null : sourcePeriods[0];
    const exactPeriod = !!sourcePeriod && start === sourcePeriod.start && end === sourcePeriod.end;
    const dailyMetricsAvailable = false;
    const allMetricsPresent = rows.every(r => r.diamonds != null && r.liveHours != null && r.validDays != null);

    return {
      sheet: sheetUsed,
      sourcePeriod,
      sourcePeriods,
      mixedPeriods,
      selectedPeriod: { start, end },
      exactPeriod,
      canEvaluate: !mixedPeriods && invalidPeriodRows === 0 && exactPeriod && allMetricsPresent,
      granularity: dailyMetricsAvailable ? 'daily' : 'period_aggregate',
      rows,
      warnings: Array.from(new Set(warnings.concat(mixedPeriods ? ['El archivo contiene más de un periodo de datos. No se permite evaluar ni guardar esta importación.'] : []))),
      summary: {
        creators: rows.length,
        duplicatesOrWarnings: warnings.length + (mixedPeriods ? 1 : 0),
        evaluableRows: rows.filter(r => r.diamonds != null && r.liveHours != null && r.validDays != null).length
      },
      restriction: mixedPeriods
        ? 'El archivo mezcla varios periodos de datos. Sepáralos en archivos independientes antes de evaluar.'
        : invalidPeriodRows > 0
          ? 'Hay filas con periodos inválidos. Corrige el archivo antes de evaluar para no excluir actividad.'
          : exactPeriod
            ? (allMetricsPresent ? null : 'Hay creadores sin todas las métricas necesarias. Revisa los datos faltantes antes de evaluar.')
            : 'El Excel contiene cifras acumuladas para ' + sourcePeriod.start + ' a ' + sourcePeriod.end + '. No es posible calcular un subperiodo sin exportación diaria de TikTok.'
    };
  }

  root.GRAYXON_FOLLOWUP_IMPORT = { parseWorkbook, parsePeriod, parseDurationHours, normalizeHeader, parseInteger };
})(typeof window !== 'undefined' ? window : globalThis);
