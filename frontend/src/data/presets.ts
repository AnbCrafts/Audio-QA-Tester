import { BusinessPreset } from '../types';

export const BUSINESS_PRESETS: BusinessPreset[] = [
  {
    id: 'saas_sales',
    name: 'B2B SaaS Sales',
    industry: 'Software & Technology',
    description: 'Evaluates consultative selling, patience during technical/pricing objections, and structured follow-ups.',
    defaultSensitivity: 'balanced',
    defaultActionItemScope: 'explicit_commitments',
    defaultToneCriteria:
      'Representative must maintain active listening, consultative empathy, and respect during pricing or technical objections. Flag RED if the rep interrupts rudely, exhibits sarcasm, dismisses customer budget concerns, or acts arrogant.',
  },
  {
    id: 'debt_collection',
    name: 'Financial Recovery & Compliance',
    industry: 'FinTech / Collections',
    description: 'Strict regulatory adherence (FDCPA style). Zero tolerance for aggressive, harassing, or hostile language.',
    defaultSensitivity: 'strict',
    defaultActionItemScope: 'strict_deadlines_only',
    defaultToneCriteria:
      'Representative must strictly maintain a calm, respectful, compliant demeanor. Flag RED immediately for any intimidating phrasing, raised voices, veiled threats, or condescending remarks regarding customer financial status.',
  },
  {
    id: 'real_estate',
    name: 'High-Ticket Real Estate & Advisory',
    industry: 'Real Estate / Advisory',
    description: 'Relationship-driven tone, high attentiveness to buyer concerns, and accurate scheduling.',
    defaultSensitivity: 'balanced',
    defaultActionItemScope: 'all_followups',
    defaultToneCriteria:
      'Representative should be welcoming, warm, and highly attentive. Flag RED if rep appears rushed, indifferent, brushes off property questions, or fails to show genuine interest in buyer criteria.',
  },
  {
    id: 'custom',
    name: 'Custom Industry Rubric',
    industry: 'User Defined',
    description: 'Tailor all criteria, forbidden terminology, and sensitivity thresholds to your exact organization standards.',
    defaultSensitivity: 'balanced',
    defaultActionItemScope: 'explicit_commitments',
    defaultToneCriteria:
      'Evaluate representative for general professionalism, respectful tone, and clear communication. Flag RED if representative is hostile, dismissive, or abusive.',
  },
];
