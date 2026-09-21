import { ClauseItem, HealthScore, RiskCategory, RiskLevel } from '../types';

export const CATEGORIES: RiskCategory[] = [
  'Financial Risk',
  'Termination Risk',
  'Liability Exposure',
  'Data Privacy',
];

const RISK_PENALTY: Record<RiskLevel, number> = {
  Low: 0,
  Medium: 15,
  High: 30,
};

const CATEGORY_HINTS: Record<RiskCategory, RegExp> = {
  'Financial Risk': /rent|fee|payment|deposit|price|cost|fine|penalt|interest|money|charge|invoice/i,
  'Termination Risk': /terminat|renew|notice|cancel|expiry|expire|end|early|breach|default/i,
  'Liability Exposure': /liabil|indemn|damag|loss|warrant|insurance|responsib|hold harmless/i,
  'Data Privacy': /privacy|personal data|personal information|confidential|data|security|consent|gdpr/i,
};

export function inferCategory(clause: Partial<ClauseItem>): RiskCategory {
  const text = `${clause.heading || ''} ${clause.summary || ''} ${clause.source_span || ''}`;
  for (const cat of CATEGORIES) {
    if (CATEGORY_HINTS[cat].test(text)) {
      return cat;
    }
  }
  return 'Liability Exposure';
}

export function scoreClauses(clauses: ClauseItem[]): HealthScore {
  const categoryPenalties: Record<RiskCategory, number> = {
    'Financial Risk': 0,
    'Termination Risk': 0,
    'Liability Exposure': 0,
    'Data Privacy': 0,
  };

  let highRiskCount = 0;

  for (const clause of clauses) {
    let category = clause.risk_category;
    if (!category || !CATEGORIES.includes(category)) {
      category = inferCategory(clause);
    }
    const risk = clause.risk_level || 'Medium';
    if (risk === 'High') {
      highRiskCount += 1;
    }
    const penalty = RISK_PENALTY[risk] ?? 15;
    categoryPenalties[category] = (categoryPenalties[category] || 0) + penalty;
  }

  const categoryScores: Record<RiskCategory, number> = {
    'Financial Risk': Math.max(0, 100 - Math.min(100, categoryPenalties['Financial Risk'])),
    'Termination Risk': Math.max(0, 100 - Math.min(100, categoryPenalties['Termination Risk'])),
    'Liability Exposure': Math.max(0, 100 - Math.min(100, categoryPenalties['Liability Exposure'])),
    'Data Privacy': Math.max(0, 100 - Math.min(100, categoryPenalties['Data Privacy'])),
  };

  const scoreValues = Object.values(categoryScores);
  const overall = Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length);

  const groundedCount = clauses.filter((c) => c.grounded).length;
  const groundedRate = clauses.length > 0 ? groundedCount / clauses.length : 1.0;

  return {
    overall,
    high_risk_count: highRiskCount,
    category_scores: categoryScores,
    grounded_rate: groundedRate,
  };
}
